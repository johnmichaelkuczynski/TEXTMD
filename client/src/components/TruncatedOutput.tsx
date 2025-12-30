import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

interface TruncatedOutputProps {
  content: string;
  isTruncated: boolean;
  outputId?: string;
  outputType?: string;
  fullWordCount?: number;
  previewWordCount?: number;
  onUpgradeClick?: () => void;
}

export function TruncatedOutput({
  content,
  isTruncated,
  fullWordCount,
  previewWordCount,
  onUpgradeClick,
}: TruncatedOutputProps) {
  const { user } = useAuth();
  const [isExpanded, setIsExpanded] = useState(true);
  
  const handleUpgrade = () => {
    if (onUpgradeClick) {
      onUpgradeClick();
    } else {
      window.location.href = '/api/stripe/create-checkout-session';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1"
            data-testid="button-toggle-output"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <span className="text-sm text-muted-foreground">
            Output
          </span>
          {isTruncated && (
            <Badge variant="secondary" className="text-xs">
              <Lock className="h-3 w-3 mr-1" />
              Preview
            </Badge>
          )}
        </div>
        {isTruncated && fullWordCount && previewWordCount && (
          <span className="text-xs text-muted-foreground">
            Showing {previewWordCount} of {fullWordCount} words
          </span>
        )}
      </div>
      
      {isExpanded && (
        <>
          <Card className="p-4 bg-muted/30">
            <pre className="whitespace-pre-wrap text-sm font-mono overflow-auto max-h-[500px]">
              {content}
            </pre>
          </Card>
          
          {isTruncated && (
            <Card className="p-6 border-2 border-dashed border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="p-3 rounded-full bg-primary/10">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">Upgrade to Unlock Full Output</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    You're viewing a preview of the AI-generated content. 
                    Upgrade to Pro for just $1/month to unlock the complete output
                    {fullWordCount && ` (${fullWordCount} words)`}.
                  </p>
                </div>
                <Button 
                  onClick={handleUpgrade}
                  className="gap-2"
                  data-testid="button-upgrade-unlock"
                >
                  <Sparkles className="h-4 w-4" />
                  Upgrade to Pro - $1/month
                </Button>
                {!user && (
                  <p className="text-xs text-muted-foreground">
                    Already have Pro? <a href="/auth" className="text-primary underline">Sign in</a> to access full content.
                  </p>
                )}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export function UpgradeCTA({ compact = false }: { compact?: boolean }) {
  const handleUpgrade = async () => {
    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Upgrade error:', error);
    }
  };

  if (compact) {
    return (
      <Button 
        size="sm" 
        variant="outline" 
        onClick={handleUpgrade}
        className="gap-1"
        data-testid="button-upgrade-compact"
      >
        <Lock className="h-3 w-3" />
        Unlock Full
      </Button>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 p-2 rounded-md bg-primary/10 border border-primary/20">
      <Lock className="h-4 w-4 text-primary" />
      <span className="text-sm">Output truncated</span>
      <Button 
        size="sm" 
        onClick={handleUpgrade}
        className="gap-1"
        data-testid="button-upgrade-inline"
      >
        <Sparkles className="h-3 w-3" />
        Upgrade
      </Button>
    </div>
  );
}
