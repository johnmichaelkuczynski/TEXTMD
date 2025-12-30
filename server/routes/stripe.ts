import { Express, Request, Response } from "express";
import Stripe from "stripe";
import { storage } from "../storage";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-04-30.basil",
});

export function registerStripeRoutes(app: Express) {
  // Create checkout session for subscription
  app.post("/api/stripe/create-checkout-session", async (req: Request, res: Response) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const userId = (req.user as any).id;
    const userEmail = (req.user as any).email;

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            price: process.env.STRIPE_PRICE_ID!,
            quantity: 1,
          },
        ],
        success_url: "https://textmd.xyz/billing/success",
        cancel_url: "https://textmd.xyz/billing/cancel",
        customer_email: userEmail || undefined,
        metadata: {
          userId: userId.toString(),
        },
        subscription_data: {
          metadata: {
            userId: userId.toString(),
          },
        },
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Stripe checkout error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Stripe webhook handler
  app.post("/api/stripe/webhook", async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"];
    
    if (!sig) {
      return res.status(400).json({ error: "Missing stripe-signature header" });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    console.log("Stripe webhook event:", event.type);

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.metadata?.userId;
          
          if (userId && session.subscription && session.customer) {
            await storage.updateUserSubscription(parseInt(userId), {
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: session.subscription as string,
              subscriptionStatus: "active",
              isPro: true,
            });
            console.log(`User ${userId} subscription activated`);
          }
          break;
        }

        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;
          const user = await storage.getUserByStripeCustomerId(customerId);
          
          if (user) {
            const isActive = subscription.status === "active";
            await storage.updateUserSubscription(user.id, {
              stripeSubscriptionId: subscription.id,
              subscriptionStatus: subscription.status,
              isPro: isActive,
            });
            console.log(`User ${user.id} subscription updated: ${subscription.status}, isPro: ${isActive}`);
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
            console.log(`User ${user.id} subscription canceled`);
          }
          break;
        }
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error("Webhook processing error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get billing status
  app.get("/api/billing/status", async (req: Request, res: Response) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user as any;
    
    res.json({
      isPro: user.isPro || false,
      subscriptionStatus: user.subscriptionStatus || null,
      stripeCustomerId: user.stripeCustomerId || null,
    });
  });
}
