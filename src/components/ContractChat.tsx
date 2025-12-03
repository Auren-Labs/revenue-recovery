import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2, FileText, MessageSquare, Copy, Check, Sparkles, Bot, User, X } from "lucide-react";
import { getAuthHeader } from "@/utils/auth";
import { useToast } from "@/components/ui/use-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";

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
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
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

  const handleCopyMessage = async (messageIndex: number) => {
    const message = messages[messageIndex];
    if (message) {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(messageIndex);
      toast({
        title: "Copied!",
        description: "Message copied to clipboard",
      });
      setTimeout(() => setCopiedMessageId(null), 2000);
    }
  };

  const suggestedQuestions = [
    "What's my escalation rate?",
    "When is the renewal deadline?",
    "What are the key pricing terms?",
    "What SLA credits am I entitled to?",
    "Show me the pricing timeline",
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gradient-to-br from-background via-background to-muted/10">
      {/* Messages Area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <ScrollArea className="flex-1">
          <div className="space-y-4 px-4 sm:px-6 py-6" ref={scrollRef}>
            {messages.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-12 max-w-md mx-auto"
              >
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: "spring" }}
                  className="inline-flex h-20 w-20 rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 border-2 border-primary/30 items-center justify-center mb-6 shadow-lg shadow-primary/10"
                >
                  <Bot className="h-10 w-10 text-primary" />
                </motion.div>
                <motion.h3
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-xl font-semibold text-foreground mb-2"
                >
                  Ask AI Copilot
                </motion.h3>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-sm text-muted-foreground mb-8"
                >
                  Get instant answers about pricing, escalations, and contract terms
                </motion.p>
                <div className="flex flex-col gap-2">
                  {suggestedQuestions.map((question, idx) => (
                    <motion.button
                      key={question}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 + idx * 0.1 }}
                      onClick={() => setInput(question)}
                      className="text-left text-sm px-4 py-3 rounded-xl bg-card hover:bg-muted/50 text-foreground transition-all duration-200 border border-border/50 hover:border-primary/30 hover:shadow-sm group"
                    >
                      <div className="flex items-center gap-3">
                        <Sparkles className="h-4 w-4 text-primary/60 group-hover:text-primary transition-colors" />
                        <span>{question}</span>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            <AnimatePresence>
              {messages.map((message, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className={`flex gap-3 group ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 shadow-sm ring-1 ring-primary/10">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                  )}

                  <div className="flex flex-col gap-1 max-w-[85%] sm:max-w-[75%]">
                    <div
                      className={`relative rounded-2xl px-4 py-3 shadow-sm transition-all duration-200 ${
                        message.role === "user"
                          ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-br-md"
                          : "bg-card border border-border/50 backdrop-blur-sm rounded-bl-md hover:border-border"
                      }`}
                    >
                      {/* Copy button */}
                      <button
                        onClick={() => handleCopyMessage(idx)}
                        className={`absolute top-2 right-2 p-1.5 rounded-lg transition-all duration-200 ${
                          message.role === "user"
                            ? "text-primary-foreground/60 hover:text-primary-foreground hover:bg-primary-foreground/20"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100"
                        }`}
                        title="Copy message"
                      >
                        {copiedMessageId === idx ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
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
                        <div className="whitespace-pre-wrap text-sm leading-relaxed pr-8">{message.content}</div>
                      )}
                    </div>
                    
                    {/* Timestamp */}
                    <div className={`text-xs text-muted-foreground px-1 ${message.role === "user" ? "text-right" : "text-left"}`}>
                      {format(new Date(), "h:mm a")}
                    </div>
                  </div>

                  {message.role === "user" && (
                    <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-primary to-primary/90 flex items-center justify-center flex-shrink-0 shadow-sm ring-1 ring-primary/20">
                      <User className="h-5 w-5 text-primary-foreground" />
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3 justify-start"
              >
                <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 shadow-sm ring-1 ring-primary/10">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <div className="bg-card border border-border/50 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      <motion.div
                        className="h-2 w-2 rounded-full bg-primary"
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                      />
                      <motion.div
                        className="h-2 w-2 rounded-full bg-primary"
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                      />
                      <motion.div
                        className="h-2 w-2 rounded-full bg-primary"
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground">AI is thinking...</span>
                  </div>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="flex-shrink-0 border-t border-border/50 bg-gradient-to-t from-background via-background to-background/95 backdrop-blur-xl px-4 sm:px-6 py-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about your contracts, pricing, escalations..."
                className="min-h-[60px] max-h-[140px] resize-none pr-20 rounded-2xl border-border/50 bg-card/80 backdrop-blur-sm focus:bg-card focus:border-primary/50 transition-all duration-200 text-sm leading-relaxed shadow-sm"
                disabled={isLoading}
              />
              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                {input.trim() && (
                  <span className="text-xs text-muted-foreground opacity-60">
                    {input.length} chars
                  </span>
                )}
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <span className="text-xs text-muted-foreground opacity-50">
                    Enter to send
                  </span>
                )}
              </div>
            </div>
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="h-[60px] w-[60px] shrink-0 rounded-2xl shadow-lg bg-gradient-to-br from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
          {messages.length > 0 && (
            <div className="mt-2 text-xs text-center text-muted-foreground opacity-60">
              AI responses may include inaccuracies. Always verify important information.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

