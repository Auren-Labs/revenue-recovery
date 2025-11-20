import { Mail } from "lucide-react";

const Footer = () => {
  return (
    <footer id="contact" className="bg-primary text-primary-foreground py-12 border-t border-primary/20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div>
            <h3 className="text-2xl font-bold mb-3">ContractGuard</h3>
            <p className="text-primary-foreground/80 text-sm">
              AI-powered revenue recovery platform for B2B companies.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold mb-3">Quick Links</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#features" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  Features
                </a>
              </li>
              <li>
                <a href="#pricing" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  Pricing
                </a>
              </li>
              <li>
                <a href="#waitlist" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  Join Waitlist
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold mb-3">Contact</h4>
            <a 
              href="mailto:hello@contractguard.ai" 
              className="flex items-center gap-2 text-primary-foreground/80 hover:text-primary-foreground transition-colors text-sm"
            >
              <Mail className="h-4 w-4" />
              hello@contractguard.ai
            </a>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-primary-foreground/10">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-primary-foreground/60">
            <p>© 2024 ContractGuard. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-primary-foreground transition-colors">
                Privacy Policy
              </a>
              <a href="#" className="hover:text-primary-foreground transition-colors">
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
