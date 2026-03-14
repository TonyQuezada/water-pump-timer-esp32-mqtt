import NextAuth, { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

// ========== AUTH CONFIG ==========
// This file must NOT import anything from lib/db.ts because it is used
// by middleware.ts which runs in the Edge runtime. Node.js APIs like
// fs, path, and better-sqlite3 are not available there.
//
// The DB lookup happens inside the authorize() callback which only runs
// in the Node.js runtime (API routes), never in the Edge runtime.

export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username as string;
        const password = credentials?.password as string;

        if (!username || !password) return null;

        // Dynamic import keeps better-sqlite3 out of the Edge bundle
        const { userQueries } = await import("@/lib/db");

        const user = userQueries.findByUsername.get(username);
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return null;

        return {
          id:    String(user.id),
          name:  user.username,
          email: user.username,
          role:  user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        session.user.name = token.name;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge:   30 * 24 * 60 * 60, // 30 days
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);