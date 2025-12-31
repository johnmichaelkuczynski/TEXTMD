import { 
  users, 
  documents, 
  analyses, 
  userActivities, 
  cognitiveProfiles, 
  intelligentRewrites,
  rewriteJobs,
  generatedOutputs,
  type User, 
  type InsertUser, 
  type InsertDocument, 
  type Document, 
  type InsertUserActivity, 
  type InsertCognitiveProfile,
  type InsertRewriteJob,
  type RewriteJob,
  type InsertGeneratedOutput,
  type GeneratedOutput
} from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import session from "express-session";
import createMemoryStore from "memorystore";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  updateUserGoogleId(userId: number, googleId: string, email?: string, profileImageUrl?: string): Promise<User>;
  sessionStore: any;
  
  // Document operations
  createDocument(doc: InsertDocument): Promise<Document>;
  getDocumentsByUser(userId: number): Promise<Document[]>;
  
  // Analysis operations
  createAnalysis(analysis: any): Promise<any>;
  
  // Intelligent Rewrite operations
  createIntelligentRewrite(rewrite: any): Promise<any>;
  
  // Activity tracking
  logActivity(activity: InsertUserActivity): Promise<void>;
  
  // Cognitive profile operations
  getCognitiveProfile(userId: number): Promise<any>;
  updateCognitiveProfile(userId: number, profile: Partial<InsertCognitiveProfile>): Promise<void>;
  
  // GPT Bypass Humanizer operations
  createRewriteJob(job: InsertRewriteJob): Promise<RewriteJob>;
  getRewriteJob(id: number): Promise<RewriteJob | undefined>;
  updateRewriteJob(id: number, updates: Partial<RewriteJob>): Promise<RewriteJob>;
  listRewriteJobs(): Promise<RewriteJob[]>;
  
  // Pro status operations
  updateUserProStatus(userId: number, isPro: boolean): Promise<User>;
  
  // Generated outputs operations (for free-tier limiting)
  createGeneratedOutput(output: InsertGeneratedOutput): Promise<GeneratedOutput>;
  getGeneratedOutput(outputId: string): Promise<GeneratedOutput | undefined>;
  getGeneratedOutputsByUser(userId: number): Promise<GeneratedOutput[]>;
  getLatestOutputByUser(userId: number): Promise<GeneratedOutput | undefined>;
}

const MemoryStore = createMemoryStore(session);

export class DatabaseStorage implements IStorage {
  sessionStore: any;

  constructor() {
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000, // prune expired entries every 24h
    });
  }
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user || undefined;
  }

  async updateUserGoogleId(userId: number, googleId: string, email?: string, profileImageUrl?: string): Promise<User> {
    const updateData: any = { googleId };
    if (email) updateData.email = email;
    if (profileImageUrl) updateData.profileImageUrl = profileImageUrl;
    
    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async createDocument(doc: InsertDocument): Promise<Document> {
    const [document] = await db
      .insert(documents)
      .values(doc)
      .returning();
    return document;
  }

  async getDocumentsByUser(userId: number): Promise<Document[]> {
    return await db
      .select()
      .from(documents)
      .where(eq(documents.userId, userId));
  }

  async logActivity(activity: InsertUserActivity): Promise<void> {
    await db.insert(userActivities).values(activity);
  }

  async getCognitiveProfile(userId: number): Promise<any> {
    const [profile] = await db
      .select()
      .from(cognitiveProfiles)
      .where(eq(cognitiveProfiles.userId, userId));
    return profile;
  }

  async updateCognitiveProfile(userId: number, profile: Partial<InsertCognitiveProfile>): Promise<void> {
    await db
      .insert(cognitiveProfiles)
      .values({ ...profile, userId })
      .onConflictDoUpdate({
        target: cognitiveProfiles.userId,
        set: { ...profile, lastUpdated: new Date() }
      });
  }

  async createAnalysis(analysis: any): Promise<any> {
    const [result] = await db
      .insert(analyses)
      .values(analysis)
      .returning();
    return result;
  }

  async createIntelligentRewrite(rewrite: any): Promise<any> {
    const [result] = await db
      .insert(intelligentRewrites)
      .values(rewrite)
      .returning();
    return result;
  }
  
  // GPT Bypass Humanizer operations
  async createRewriteJob(insertJob: InsertRewriteJob): Promise<RewriteJob> {
    const [job] = await db
      .insert(rewriteJobs)
      .values(insertJob)
      .returning();
    return job;
  }

  async getRewriteJob(id: number): Promise<RewriteJob | undefined> {
    const result = await db
      .select()
      .from(rewriteJobs)
      .where(eq(rewriteJobs.id, id))
      .limit(1);
    return result[0];
  }

  async updateRewriteJob(id: number, updates: Partial<RewriteJob>): Promise<RewriteJob> {
    const [updated] = await db
      .update(rewriteJobs)
      .set(updates)
      .where(eq(rewriteJobs.id, id))
      .returning();
    return updated;
  }

  async listRewriteJobs(): Promise<RewriteJob[]> {
    return await db
      .select()
      .from(rewriteJobs)
      .orderBy(eq(rewriteJobs.createdAt, rewriteJobs.createdAt)) // Simple order by
      .limit(50);
  }

  // Pro status operations
  async updateUserProStatus(userId: number, isPro: boolean): Promise<User> {
    const [updated] = await db
      .update(users)
      .set({ isPro })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }
  
  // Generated outputs operations (for free-tier limiting)
  async createGeneratedOutput(output: InsertGeneratedOutput): Promise<GeneratedOutput> {
    const [created] = await db
      .insert(generatedOutputs)
      .values(output)
      .returning();
    return created;
  }
  
  async getGeneratedOutput(outputId: string): Promise<GeneratedOutput | undefined> {
    const [output] = await db
      .select()
      .from(generatedOutputs)
      .where(eq(generatedOutputs.outputId, outputId));
    return output || undefined;
  }
  
  async getGeneratedOutputsByUser(userId: number): Promise<GeneratedOutput[]> {
    return await db
      .select()
      .from(generatedOutputs)
      .where(eq(generatedOutputs.userId, userId));
  }
  
  async getLatestOutputByUser(userId: number): Promise<GeneratedOutput | undefined> {
    const results = await db
      .select()
      .from(generatedOutputs)
      .where(eq(generatedOutputs.userId, userId))
      .orderBy(generatedOutputs.createdAt)
      .limit(1);
    return results[0];
  }
}

export const storage = new DatabaseStorage();
