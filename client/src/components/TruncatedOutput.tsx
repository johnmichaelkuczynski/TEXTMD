import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock, ChevronDown, ChevronUp, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

interface TruncatedOutputProps {
  content: string;
  isTruncated: boolean;
  outputId?: string;
  outputType?: string;
  fullWordCount?: number;
  previewWordCount?: number;
  onLoginClick?: () => void;
}

export function TruncatedOutput({
  content,
  isTruncated,
  fullWordCount,
  previewWordCount,
  onLoginClick,
}: TruncatedOutputProps) {
  const { user } = useAuth();
  const [isExpanded, setIsExpanded] = useState(true);

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
          
          {isTruncated && !user && (
            <Card className="p-6 border-2 border-dashed border-muted-foreground/30 bg-muted/10">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="p-3 rounded-full bg-muted">
                  <User className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">Sign In to Access Full Output</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    You're viewing a preview of the AI-generated content. 
                    Sign in to unlock the complete output
                    {fullWordCount && ` (${fullWordCount} words)`}.
                  </p>
                </div>
                {onLoginClick && (
                  <Button 
                    onClick={onLoginClick}
                    className="gap-2"
                    data-testid="button-signin-unlock"
                  >
                    <User className="h-4 w-4" />
                    Sign In
                  </Button>
                )}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
