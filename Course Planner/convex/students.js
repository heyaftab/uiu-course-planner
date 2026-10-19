import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.query("students")
      .withIndex("by_id", args.id)
      .first();
  },
});

export const create = mutation({
  args: { id: v.string(), name: v.string(), email: v.string(), passwordHash: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("students", {
      id: args.id,
      name: args.name,
      email: args.email,
      passwordHash: args.passwordHash,
    });
  },
});

export const update = mutation({
  args: { id: v.string(), name: v.optional(v.string()), phone: v.optional(v.string()), profilePhoto: v.optional(v.string()), passwordHash: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const student = await ctx.db.query("students").withIndex("by_id", args.id).first();
    if (!student) throw new Error("Student not found");
    await ctx.db.patch(student._id, {
      name: args.name,
      phone: args.phone,
      profilePhoto: args.profilePhoto,
      passwordHash: args.passwordHash,
    });
  },
});
