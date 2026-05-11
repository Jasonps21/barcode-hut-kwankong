"use client";

import { useActionState } from "react";
import { Loader2, Lock, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loginAction, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, undefined);
  const eventName = process.env.NEXT_PUBLIC_EVENT_NAME ?? "Sistem Bingkisan";

  return (
    <Card className="border-none shadow-xl">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Package className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">Masuk</CardTitle>
        <CardDescription>{eventName}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="nama@email.com" autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {state?.error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <Lock className="h-4 w-4" /> {state.error}
            </div>
          )}
          <Button type="submit" disabled={pending} className="w-full" size="lg">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {pending ? "Memproses..." : "Masuk"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
