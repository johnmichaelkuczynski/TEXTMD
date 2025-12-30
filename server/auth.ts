import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser, insertUserSchema, LoginData } from "@shared/schema";
import { z } from "zod";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required")
});

const registerSchema = insertUserSchema.pick({
  username: true,
  password: true,
  email: true
}).extend({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters")
});

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

async function generateUniqueUsername(baseUsername: string): Promise<string> {
  let username = baseUsername.toLowerCase().replace(/[^a-z0-9]/g, '');
  let counter = 0;
  
  while (true) {
    const candidate = counter === 0 ? username : `${username}${counter}`;
    const existing = await storage.getUserByUsername(candidate);
    if (!existing) {
      return candidate;
    }
    counter++;
    if (counter > 1000) {
      return `${username}_${randomBytes(4).toString('hex')}`;
    }
  }
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const normalizedUsername = (username || "").trim().toLowerCase();
        
        // Special case: JMKUCZYNSKI can log in with any password (DEVELOPMENT ONLY)
        if (normalizedUsername === "jmkuczynski" && process.env.NODE_ENV === "development") {
          let user = await storage.getUserByUsername(normalizedUsername);
          if (!user) {
            // Create the special user if they don't exist
            user = await storage.createUser({
              username: normalizedUsername,
              password: await hashPassword("Brahms777!"),
              email: "admin@cognitive.platform"
            });
          }
          return done(null, user);
        }

        // Regular authentication for all other users
        const user = await storage.getUserByUsername(normalizedUsername);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        } else {
          return done(null, user);
        }
      } catch (error) {
        return done(error);
      }
    }),
  );

  // Google OAuth Strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const callbackURL = 'https://textmd.xyz/auth/google/callback';
    
    console.log(`Google OAuth configured with callback: ${callbackURL}`);
    
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL,
        },
        async (accessToken: string, refreshToken: string, profile: Profile, done) => {
          try {
            const googleId = profile.id;
            const email = profile.emails?.[0]?.value;
            const profileImageUrl = profile.photos?.[0]?.value;
            
            // Check if user exists with this Google ID
            let user = await storage.getUserByGoogleId(googleId);
            
            if (user) {
              return done(null, user);
            }
            
            // Check if user exists with this email (link accounts)
            if (email) {
              const existingUserByEmail = await storage.getUserByUsername(email.toLowerCase());
              if (existingUserByEmail) {
                // Link Google account to existing user
                user = await storage.updateUserGoogleId(existingUserByEmail.id, googleId, email, profileImageUrl);
                return done(null, user);
              }
            }
            
            // Create new user with Google OAuth
            const username = email?.split('@')[0] || `google_${googleId}`;
            const uniqueUsername = await generateUniqueUsername(username);
            
            user = await storage.createUser({
              username: uniqueUsername,
              password: await hashPassword(randomBytes(32).toString('hex')), // Random password for OAuth users
              email: email || undefined,
              googleId,
              profileImageUrl,
            });
            
            return done(null, user);
          } catch (error) {
            return done(error as Error);
          }
        }
      )
    );
  } else {
    console.log('Google OAuth not configured - missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
  }

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      // Validate request body
      const validationResult = registerSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validationResult.error.errors 
        });
      }

      const { password, email } = validationResult.data;
      const normalizedUsername = String(validationResult.data.username || "").trim().toLowerCase();

      const existingUser = await storage.getUserByUsername(normalizedUsername);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await storage.createUser({
        username: normalizedUsername,
        password: await hashPassword(password),
        email: email || undefined,
      });

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (error) {
      next(error);
    }
  });

  // Special endpoint removed for security - admin bypass now only in /api/login with env protection

  app.post("/api/login", async (req, res, next) => {
    const normalizedUsername = String(req.body.username || "").trim().toLowerCase();
    req.body.username = normalizedUsername;
    
    // Special case for JMKUCZYNSKI - bypass passport entirely (DEVELOPMENT ONLY)
    if (normalizedUsername === "jmkuczynski" && process.env.NODE_ENV === "development") {
      try {
        let user = await storage.getUserByUsername(normalizedUsername);
        if (!user) {
          user = await storage.createUser({
            username: normalizedUsername,
            password: await hashPassword("Brahms777!"),
            email: "admin@cognitive.platform"
          });
        }
        
        req.login(user, (err) => {
          if (err) return next(err);
          res.status(200).json(user);
        });
        return; // Exit early for JMKUCZYNSKI
      } catch (error) {
        return res.status(500).json({ message: "Internal server error" });
      }
    } else {
      // Regular validation for other users
      const validationResult = loginSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validationResult.error.errors 
        });
      }
    }

    passport.authenticate("local", (err: any, user: any) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      req.login(user, (err) => {
        if (err) return next(err);
        res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });

  // Google OAuth routes
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    app.get("/auth/google", passport.authenticate("google", { 
      scope: ["profile", "email"] 
    }));

    app.get("/auth/google/callback", 
      passport.authenticate("google", { 
        failureRedirect: "/?error=google_auth_failed" 
      }),
      async (req, res) => {
        // Link any anonymous session outputs to the newly logged-in user
        const anonSessionId = req.cookies?.anon_session;
        const userId = (req.user as any)?.id;
        
        if (anonSessionId && userId) {
          try {
            await storage.linkSessionOutputsToUser(anonSessionId, userId);
            // Clear the anonymous session cookie after linking
            res.clearCookie('anon_session');
            console.log(`Linked anonymous session ${anonSessionId} to user ${userId}`);
          } catch (error) {
            console.error('Failed to link session outputs:', error);
          }
        }
        
        // Successful authentication, redirect to home
        res.redirect("/");
      }
    );
  }
}