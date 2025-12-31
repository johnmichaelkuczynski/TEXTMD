import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";
import { useLocation } from "wouter";

export default function BillingCancelPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="p-8 max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="p-4 rounded-full bg-muted">
            <XCircle className="h-12 w-12 text-muted-foreground" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Payment Cancelled</h1>
          <p className="text-muted-foreground">
            No worries! Your subscription was not processed. You can try again anytime.
          </p>
        </div>
        
        <Button 
          onClick={() => setLocation("/")}
          className="w-full"
          data-testid="button-go-home"
        >
          Return to TEXT MD
        </Button>
      </Card>
    </div>
  );
}
