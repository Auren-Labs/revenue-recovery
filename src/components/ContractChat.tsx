import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2, FileText, MessageSquare } from "lucide-react";
import { getAuthHeader } from "@/utils/auth";
import { useToast } from "@/components/ui/use-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: Array<{
    text: string;
    citation: string;
    source_type: string;
    similarity: number;
    metadata: Record<string, any>;
    reference?: string;
    filename?: string;
  }>;
};

type ContractChatProps = {
  jobId: string;
  vendorName?: string;
  onOpenDocument?: (evidence: {
    type: string;
    file?: string;
    page?: number;
    label?: string;
    text?: string;
    bounds?: any;
    regions?: any[];
    metadata?: Record<string, any>;
  }) => void;
};

export const ContractChat = ({ jobId, vendorName, onOpenDocument }: ContractChatProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const markdownRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const { toast } = useToast();

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Make inline [1], [2] references clickable after markdown renders
  useEffect(() => {
    if (!onOpenDocument) return;
    
    // Use setTimeout to ensure DOM is fully rendered
    const timeoutId = setTimeout(() => {
      markdownRefs.current.forEach((container, messageIdx) => {
        if (!container) return;
        
        const message = messages[messageIdx];
        if (!message || message.role !== "assistant" || !message.sources) return;
        
        // Find all text nodes containing [1], [2] patterns
        const walker = document.createTreeWalker(
          container,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => {
              // Skip if parent is already a button (already processed)
              if (node.parentElement?.tagName === 'BUTTON') {
                return NodeFilter.FILTER_REJECT;
              }
              if (node.nodeValue?.match(/\[\d+\]/)) {
                return NodeFilter.FILTER_ACCEPT;
              }
              return NodeFilter.FILTER_REJECT;
            }
          }
        );
        
        const textNodes: Text[] = [];
        let node;
        while (node = walker.nextNode()) {
          textNodes.push(node as Text);
        }
        
        // Process in reverse to avoid issues with DOM mutations
        textNodes.reverse().forEach((textNode) => {
          const text = textNode.nodeValue || '';
          const parts = text.split(/(\[\d+\])/g);
          
          if (parts.length > 1) {
            const fragment = document.createDocumentFragment();
            
            parts.forEach((part) => {
              const refMatch = part.match(/\[(\d+)\]/);
              if (refMatch) {
                const sourceNum = parseInt(refMatch[1], 10);
                const source = message.sources?.[sourceNum - 1];
                if (source && onOpenDocument) {
                  const page = source.metadata?.page;
                  // Try multiple ways to get filename - prioritize direct filename field
                  let filename = source.filename || source.metadata?.filename;
                  if (!filename && source.citation) {
                    // Try to extract from citation like "Page 1 • Section: cpi_uplift • File: sample_contract.pdf"
                    const fileMatch = source.citation.match(/File:\s*([^\s•]+)/i);
                    if (fileMatch) filename = fileMatch[1];
                  }
                  // If still no filename, try to get from reference (might be filename)
                  if (!filename && source.reference && source.reference.includes('.')) {
                    filename = source.reference;
                  }
                  
                  const label = source.metadata?.reference || source.reference || source.citation?.split('•')[0]?.trim() || `Source ${sourceNum}`;
                  
                  const button = document.createElement('button');
                  button.textContent = sourceNum.toString();
                  button.className = 'inline-flex items-center justify-center min-w-[20px] h-5 px-1 mx-0.5 text-xs text-primary hover:text-primary-foreground hover:bg-primary rounded border border-primary/30 hover:border-primary font-medium cursor-pointer transition-colors align-middle';
                  button.title = `${source.citation || label}${page ? ` (Page ${page})` : ''}`;
                  button.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Reference clicked:', { sourceNum, filename, page, source, metadata: source.metadata });
                    if (filename) {
                      // Extract bounds and regions from metadata
                      const bounds = source.metadata?.bounds;
                      const regions = source.metadata?.regions || (bounds ? [{
                        page: page || 1,
                        bounds: bounds
                      }] : undefined);
                      
                      onOpenDocument({
                        type: "contract_clause",
                        file: filename,
                        page: page || 1,
                        label: label,
                        text: source.text,
                        bounds: bounds,
                        regions: regions,
                        metadata: source.metadata,
                      });
                    } else {
                      console.warn('No filename found for source:', source);
                    }
                  };
                  fragment.appendChild(button);
                } else {
                  fragment.appendChild(document.createTextNode(part));
                }
              } else if (part) {
                fragment.appendChild(document.createTextNode(part));
              }
            });
            
            if (fragment.childNodes.length > 0 && textNode.parentNode) {
              textNode.parentNode.replaceChild(fragment, textNode);
            }
          }
        });
      });
    }, 200); // Increased timeout to ensure markdown is fully rendered
    
    return () => clearTimeout(timeoutId);
  }, [messages, onOpenDocument]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/v1/chat/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          job_id: jobId,
          question: userMessage.content,
          conversation_history: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Query failed: ${response.statusText}`);
      }

      const data = await response.json();

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.answer,
        sources: data.sources || [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Chat error:", error);
      toast({
        title: "Error",
        description: "Failed to get response. Please try again.",
        variant: "destructive",
      });

      const errorMessage: ChatMessage = {
        role: "assistant",
        content: "I encountered an error. Please try again or rephrase your question.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-card/50 backdrop-blur-sm px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-primary/20">
            <MessageSquare className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">Contract Assistant</h3>
            {vendorName && (
              <p className="text-xs text-muted-foreground mt-0.5">{vendorName}</p>
            )}
          </div>
        </div>
      </div>
      
      {/* Messages Area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <ScrollArea className="flex-1">
          <div className="space-y-6 px-6 py-6" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="text-center py-12">
                <div className="inline-flex h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 items-center justify-center mb-6">
                  <MessageSquare className="h-8 w-8 text-primary/60" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Ask questions about your contracts</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Get instant answers about pricing, escalations, and contract terms
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <button
                    onClick={() => setInput("What's my escalation rate?")}
                    className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground transition-colors border border-border/50"
                  >
                    What's my escalation rate?
                  </button>
                  <button
                    onClick={() => setInput("When is the renewal deadline?")}
                    className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground transition-colors border border-border/50"
                  >
                    When is the renewal deadline?
                  </button>
                  <button
                    onClick={() => setInput("What are the key pricing terms?")}
                    className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground transition-colors border border-border/50"
                  >
                    What are the key pricing terms?
                  </button>
                </div>
              </div>
            )}

            {messages.map((message, idx) => (
              <div
                key={idx}
                className={`flex gap-3 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {message.role === "assistant" && (
                  <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <MessageSquare className="h-4 w-4 text-primary" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                    message.role === "user"
                      ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground"
                      : "bg-card border border-border/50 backdrop-blur-sm"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:mt-2 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1">
                      <div 
                        className="markdown-content"
                        ref={(el) => {
                          if (el) {
                            markdownRefs.current.set(idx, el);
                          } else {
                            markdownRefs.current.delete(idx);
                          }
                        }}
                      >
                        {(() => {
                          // Process content and render with inline clickable references
                          if (!message.sources || message.sources.length === 0) {
                            return (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                  ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                                  ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                                  li: ({ children }) => <li className="ml-2">{children}</li>,
                                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                                  em: ({ children }) => <em className="italic">{children}</em>,
                                  h1: ({ children }) => <h1 className="text-lg font-bold mt-3 mb-2">{children}</h1>,
                                  h2: ({ children }) => <h2 className="text-base font-bold mt-2 mb-1">{children}</h2>,
                                  h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
                                }}
                              >
                                {message.content}
                              </ReactMarkdown>
                            );
                          }
                          
                          let processedContent = message.content;
                          
                          // Replace source citations with [1], [2] etc.
                          // Handle various citation formats:
                          // - (filename.pdf, Page X, Section Y)
                          // - (Source 1, ...)
                          // - Source 1
                          message.sources.forEach((source, idx) => {
                            const sourceNum = idx + 1;
                            const filename = source.filename || source.metadata?.filename || source.reference;
                            
                            // Pattern 1: (filename.pdf, Page X, Section Y) or similar
                            if (filename) {
                              const escapedFilename = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                              const filenamePattern = new RegExp(
                                `\\(${escapedFilename}[^)]*\\)`,
                                'gi'
                              );
                              processedContent = processedContent.replace(filenamePattern, `[${sourceNum}]`);
                            }
                            
                            // Pattern 2: (Source N, ...)
                            const sourcePattern = new RegExp(`\\(Source\\s+${sourceNum}[^)]*\\)`, 'gi');
                            processedContent = processedContent.replace(sourcePattern, `[${sourceNum}]`);
                            
                            // Pattern 3: Source N (standalone)
                            const standalonePattern = new RegExp(`\\bSource\\s+${sourceNum}(?![0-9])`, 'gi');
                            processedContent = processedContent.replace(standalonePattern, `[${sourceNum}]`);
                            
                            // Pattern 4: Any citation format with page/section info that might match
                            // Look for patterns like (..., Page X, ...) or (..., Section Y, ...)
                            const page = source.metadata?.page;
                            const reference = source.reference || source.metadata?.reference;
                            if (page || reference) {
                              // Try to match citations that mention the page or section
                              const citationPattern = new RegExp(
                                `\\([^)]*(?:Page\\s+${page}|Section[^)]*${reference?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') || ''})[^)]*\\)`,
                                'gi'
                              );
                              processedContent = processedContent.replace(citationPattern, (match) => {
                                // Only replace if this citation hasn't been replaced yet
                                if (!match.includes('[') && !match.match(/\[\d+\]/)) {
                                  return `[${sourceNum}]`;
                                }
                                return match;
                              });
                            }
                          });
                          
                          // Remove standalone source lists
                          processedContent = processedContent.replace(
                            /\n\nSources?:?\s*\n(?:\s*[•·]\s*[^\n]+\n?)+/gi,
                            ''
                          );
                          
                          // Remove "If you have any further questions..."
                          processedContent = processedContent.replace(
                            /\n\nIf you have any further questions[^\n]*\n/gi,
                            '\n'
                          );
                          
                          // Render with ReactMarkdown - the useEffect will handle making [1], [2] clickable
                          return (
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                                li: ({ children }) => <li className="ml-2">{children}</li>,
                                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                                em: ({ children }) => <em className="italic">{children}</em>,
                                h1: ({ children }) => <h1 className="text-lg font-bold mt-3 mb-2">{children}</h1>,
                                h2: ({ children }) => <h2 className="text-base font-bold mt-2 mb-1">{children}</h2>,
                                h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
                              }}
                            >
                              {processedContent}
                            </ReactMarkdown>
                          );
                        })()}
                        
                      </div>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  )}
                </div>

                {message.role === "user" && (
                  <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/90 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <span className="text-xs font-semibold text-primary-foreground">You</span>
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <MessageSquare className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-card border border-border/50 rounded-2xl px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="flex-shrink-0 border-t bg-card/50 backdrop-blur-sm px-6 py-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about your contracts..."
                className="min-h-[56px] max-h-[120px] resize-none pr-12 rounded-xl border-border/50 bg-background/50 backdrop-blur-sm focus:bg-background transition-colors"
                disabled={isLoading}
              />
              <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
                {isLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <span className="opacity-50">Enter to send</span>
                )}
              </div>
            </div>
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="h-[56px] w-[56px] shrink-0 rounded-xl shadow-sm bg-gradient-to-br from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

