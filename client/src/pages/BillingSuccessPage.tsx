import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Crown, FileText, Loader2, AlertCircle } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { queryClient } from "@/lib/queryClient";

export default function BillingSuccessPage() {
  const [restoredOutput, setRestoredOutput] = useState<{
    content: string;
    outputType: string;
    isTruncated: boolean;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("Confirming your Pro upgrade...");
  const [isTimeout, setIsTimeout] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const attemptRef = useRef(0);

  useEffect(() => {
    const MAX_ATTEMPTS = 15;
    const POLL_INTERVAL = 1000;

    const pollForProStatus = async (): Promise<boolean> => {
      try {
        const response = await fetch('/api/billing/status', {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          return data.is_pro === true;
        }
      } catch (error) {
        console.error('Error polling billing status:', error);
      }
      return false;
    };

    const fetchOutput = async () => {
      // Fetch user's latest output (all outputs are linked to logged-in users)
      try {
        const latestResponse = await fetch('/api/output/latest', {
          credentials: 'include'
        });
        if (latestResponse.ok) {
          const data = await latestResponse.json();
          setRestoredOutput({
            content: data.content,
            outputType: data.outputType,
            isTruncated: data.isTruncated
          });
          return data;
        }
      } catch (error) {
        console.error('Error fetching latest output:', error);
      }
      
      return null;
    };

    const startPolling = () => {
      pollingRef.current = setInterval(async () => {
        attemptRef.current++;
        setStatusMessage(`Confirming Pro status... (${attemptRef.current}/${MAX_ATTEMPTS})`);
        
        const isPro = await pollForProStatus();
        
        if (isPro) {
          // Pro status confirmed! Stop polling and fetch the full output
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          
          setStatusMessage("Pro confirmed! Loading your full content...");
          
          // Invalidate caches
          queryClient.invalidateQueries({ queryKey: ['/api/billing/status'] });
          queryClient.invalidateQueries({ queryKey: ['/api/user'] });
          
          // Now fetch the output - it will return full content since is_pro=true
          await fetchOutput();
          setIsLoading(false);
          return;
        }
        
        if (attemptRef.current >= MAX_ATTEMPTS) {
          // Timeout - stop polling
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          
          setIsTimeout(true);
          setStatusMessage("Taking longer than expected...");
          
          // Still try to fetch output (might be truncated but at least show something)
          await fetchOutput();
          setIsLoading(false);
        }
      }, POLL_INTERVAL);
    };

    // Check immediately first
    const checkImmediately = async () => {
      const isPro = await pollForProStatus();
      
      if (isPro) {
        // Already Pro! No need to poll
        queryClient.invalidateQueries({ queryKey: ['/api/billing/status'] });
        queryClient.invalidateQueries({ queryKey: ['/api/user'] });
        
        setStatusMessage("Pro confirmed! Loading your full content...");
        await fetchOutput();
        setIsLoading(false);
      } else {
        // Start polling
        startPolling();
      }
    };

    checkImmediately();

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const handleGoHome = () => {
    // Navigate home - outputs are linked to user account, no need for sessionStorage
    window.location.href = '/';
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <CardTitle className="text-2xl">Welcome to Pro!</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Crown className="w-5 h-5 text-yellow-500" />
            <span className="font-medium">Your subscription is now active</span>
          </div>
          <p className="text-muted-foreground">
            You now have access to all Pro features including full, untruncated outputs.
          </p>
          
          {isLoading ? (
            <div className="flex flex-col items-center gap-2 py-4">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">{statusMessage}</span>
            </div>
          ) : isTimeout && restoredOutput?.isTruncated ? (
            <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md p-3">
              <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm font-medium">Still processing your upgrade</span>
              </div>
              <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                Your payment was successful. Please refresh in a moment to see your full content.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                className="mt-2"
                data-testid="button-refresh"
              >
                Refresh Now
              </Button>
            </div>
          ) : restoredOutput && !restoredOutput.isTruncated ? (
            <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md p-3">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                <FileText className="w-4 h-4" />
                <span className="text-sm font-medium">Your full output is ready!</span>
              </div>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                Click below to view your complete, untruncated content.
              </p>
            </div>
          ) : null}
          
          <Button 
            onClick={handleGoHome}
            className="w-full"
            data-testid="button-go-home"
          >
            {restoredOutput ? 'View Full Output' : 'Go to Dashboard'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
