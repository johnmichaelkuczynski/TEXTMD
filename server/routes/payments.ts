import type { Express, Request, Response } from "express";
import { stripe, isStripeConfigured, CREDIT_PACKAGES, type Provider, type PriceTier, hasUnlimitedCredits } from "../lib/stripe-config";
import { storage } from "../storage";
import { z } from "zod";
import Stripe from "stripe";

const checkoutSchema = z.object({
  provider: z.enum(["openai", "anthropic", "perplexity", "deepseek"]),
  amount: z.union([z.literal(5), z.literal(10), z.literal(25), z.literal(50), z.literal(100)]),
});

export function registerPaymentRoutes(app: Express) {
  // Create Stripe Checkout Session
  app.post("/api/payments/checkout", async (req: Request, res: Response) => {
    try {
      if (!isStripeConfigured || !stripe) {
        return res.status(503).json({ message: "Payment system not configured" });
      }

      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Check if user has unlimited credits (JMK)
      if (hasUnlimitedCredits(req.user.username)) {
        return res.status(400).json({ 
          message: "You have unlimited credits and don't need to purchase more" 
        });
      }

      const validation = checkoutSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request", 
          errors: validation.error.errors 
        });
      }

      const { provider, amount } = validation.data;
      const packageInfo = CREDIT_PACKAGES[provider as Provider][amount as PriceTier];

      // Create pending transaction
      const transaction = await storage.createCreditTransaction({
        userId: req.user.id,
        provider,
        amount: packageInfo.priceInCents,
        credits: packageInfo.credits,
        transactionType: "purchase",
        status: "pending",
        metadata: { package: `${provider}-${amount}` },
      });

      // Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `${provider.toUpperCase()} Credits - $${amount}`,
                description: `${packageInfo.credits.toLocaleString()} word credits for ${provider}`,
              },
              unit_amount: packageInfo.priceInCents,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}?payment=cancelled`,
        client_reference_id: String(req.user.id),
        metadata: {
          userId: String(req.user.id),
          provider,
          credits: String(packageInfo.credits),
          transactionId: String(transaction.id),
        },
      });

      // Update transaction with Stripe session ID
      await storage.updateCreditTransactionSessionId(transaction.id, session.id);

      res.json({ sessionId: session.id, url: session.url });
    } catch (error: any) {
      console.error("Checkout error:", error);
      res.status(500).json({ message: "Error creating checkout session", error: error.message });
    }
  });

  // Stripe Webhook Handler
  app.post("/api/payments/webhook", async (req: Request, res: Response) => {
    if (!isStripeConfigured || !stripe) {
      return res.status(503).send("Payment system not configured");
    }

    const sig = req.headers["stripe-signature"];
    
    if (!sig) {
      return res.status(400).send("No signature");
    }

    let event: any;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the checkout.session.completed event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      
      try {
        const userId = parseInt(session.metadata.userId);
        const provider = session.metadata.provider;
        const credits = parseInt(session.metadata.credits);
        const transactionId = parseInt(session.metadata.transactionId);

        // Get current credits or initialize
        let userCredits = await storage.getUserCredits(userId, provider);
        if (!userCredits) {
          userCredits = await storage.initializeUserCredits(userId, provider);
        }

        // Add purchased credits
        await storage.updateUserCredits(
          userId,
          provider,
          userCredits.credits + credits
        );

        // Update transaction status
        await storage.updateCreditTransactionStatus(
          transactionId,
          "completed",
          session.payment_intent as string
        );

        console.log(`✅ Credits added: ${credits} ${provider} credits for user ${userId}`);
      } catch (error) {
        console.error("Error processing webhook:", error);
      }
    }

    res.json({ received: true });
  });

  // Get user credit balances
  app.get("/api/credits/balance", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        // Return zero credits for unauthenticated users
        return res.json({
          openai: 0,
          anthropic: 0,
          perplexity: 0,
          deepseek: 0,
          unlimited: false,
        });
      }

      // Check for unlimited credits
      if (hasUnlimitedCredits(req.user.username)) {
        return res.json({
          openai: Infinity,
          anthropic: Infinity,
          perplexity: Infinity,
          deepseek: Infinity,
          unlimited: true,
        });
      }

      const credits = await storage.getAllUserCredits(req.user.id);
      
      const balance = {
        openai: 0,
        anthropic: 0,
        perplexity: 0,
        deepseek: 0,
        unlimited: false,
      };

      credits.forEach((credit) => {
        if (credit.provider in balance) {
          balance[credit.provider as Provider] = credit.credits;
        }
      });

      res.json(balance);
    } catch (error: any) {
      console.error("Error fetching balance:", error);
      res.status(500).json({ message: "Error fetching credit balance" });
    }
  });

  // ============ SUBSCRIPTION ROUTES ============

  // Create Stripe Checkout Session for subscription
  app.post("/api/stripe/create-checkout-session", async (req: Request, res: Response) => {
    try {
      if (!isStripeConfigured || !stripe) {
        return res.status(503).json({ message: "Payment system not configured" });
      }

      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const priceId = process.env.STRIPE_PRICE_ID;
      if (!priceId) {
        return res.status(500).json({ message: "Subscription price not configured" });
      }

      // Create Stripe Checkout Session for subscription
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: "https://textmd.xyz/billing/success?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "https://textmd.xyz/billing/cancel",
        client_reference_id: String(req.user.id),
        metadata: {
          userId: String(req.user.id),
        },
        customer_email: req.user.email || undefined,
      });

      console.log(`✅ Subscription checkout session created for user ${req.user.id}`);
      res.json({ sessionId: session.id, url: session.url });
    } catch (error: any) {
      console.error("Subscription checkout error:", error);
      res.status(500).json({ message: "Error creating checkout session", error: error.message });
    }
  });

  // Stripe Subscription Webhook Handler
  app.post("/api/stripe/webhook", async (req: Request, res: Response) => {
    if (!isStripeConfigured || !stripe) {
      return res.status(503).send("Payment system not configured");
    }

    const sig = req.headers["stripe-signature"];
    
    if (!sig) {
      return res.status(400).send("No signature");
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      console.error("Subscription webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`📨 Received Stripe webhook: ${event.type}`);

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          
          // Only handle subscription mode
          if (session.mode === "subscription") {
            const userId = session.metadata?.userId ? parseInt(session.metadata.userId) : null;
            const customerId = session.customer as string;
            const subscriptionId = session.subscription as string;

            if (userId) {
              await storage.updateUserSubscription(userId, {
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscriptionId,
                subscriptionStatus: "active",
                isPro: true,
              });
              console.log(`✅ Subscription activated for user ${userId}`);
            }
          }
          break;
        }

        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;
          const status = subscription.status;

          // Find user by customer ID and update their subscription status
          const user = await storage.getUserByStripeCustomerId(customerId);
          if (user) {
            const isPro = status === "active" || status === "trialing";
            await storage.updateUserSubscription(user.id, {
              subscriptionStatus: status,
              isPro,
            });
            console.log(`📝 Subscription updated for user ${user.id}: ${status}, isPro: ${isPro}`);
          }
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;

          const user = await storage.getUserByStripeCustomerId(customerId);
          if (user) {
            await storage.updateUserSubscription(user.id, {
              subscriptionStatus: "canceled",
              isPro: false,
            });
            console.log(`❌ Subscription canceled for user ${user.id}`);
          }
          break;
        }
      }
    } catch (error) {
      console.error("Error processing subscription webhook:", error);
    }

    res.json({ received: true });
  });

  // Get user billing/subscription status
  app.get("/api/billing/status", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        isPro: user.isPro || false,
        subscriptionStatus: user.subscriptionStatus || null,
        hasActiveSubscription: user.subscriptionStatus === "active" || user.subscriptionStatus === "trialing",
      });
    } catch (error: any) {
      console.error("Error fetching billing status:", error);
      res.status(500).json({ message: "Error fetching billing status" });
    }
  });
}
