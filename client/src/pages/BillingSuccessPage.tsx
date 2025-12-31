import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Sparkles } from "lucide-react";
import { useLocation } from "wouter";

export default function BillingSuccessPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const timer = setTimeout(() => {
      setLocation("/");
    }, 5000);
    return () => clearTimeout(timer);
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="p-8 max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="p-4 rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Welcome to Pro!</h1>
          <p className="text-muted-foreground">
            Your subscription is now active. You have full access to all TEXT MD features.
          </p>
        </div>
        
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          <span>Unlimited full-length outputs</span>
        </div>
        
        <Button 
          onClick={() => setLocation("/")}
          className="w-full"
          data-testid="button-go-home"
        >
          Start Using TEXT MD
        </Button>
        
        <p className="text-xs text-muted-foreground">
          Redirecting automatically in 5 seconds...
        </p>
      </Card>
    </div>
  );
}
