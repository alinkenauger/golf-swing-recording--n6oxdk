import Link from 'next/link'; // v14.x
import classNames from 'classnames'; // v2.3.x
import { AUTH_ROUTES } from 'constants/routes';

interface FooterProps {
  className?: string;
}

interface FooterSection {
  title: string;
  links: Array<{
    label: string;
    href: string;
    external?: boolean;
  }>;
}

const getCurrentYear = (): number => {
  return new Date().getFullYear();
};

const footerSections: FooterSection[] = [
  {
    title: 'Platform',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Features', href: '/features' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Support', href: '/support' }
    ]
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms', href: '/legal/terms' },
      { label: 'Privacy', href: '/legal/privacy' },
      { label: 'Cookies', href: '/legal/cookies' }
    ]
  },
  {
    title: 'Connect',
    links: [
      { label: 'Twitter', href: 'https://twitter.com/videocoaching', external: true },
      { label: 'LinkedIn', href: 'https://linkedin.com/company/videocoaching', external: true },
      { label: 'Instagram', href: 'https://instagram.com/videocoaching', external: true },
      { label: 'YouTube', href: 'https://youtube.com/videocoaching', external: true }
    ]
  }
];

const Footer: React.FC<FooterProps> = ({ className }) => {
  return (
    <footer
      role="contentinfo"
      className={classNames(
        'w-full bg-gray-50 py-8 mt-auto',
        'px-4 md:px-6 lg:px-8',
        className
      )}
    >
      <div className="max-w-7xl mx-auto">
        <nav
          className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 lg:gap-16"
          aria-label="Footer navigation"
        >
          {footerSections.map((section) => (
            <div key={section.title} className="flex flex-col">
              <h2 className="font-semibold text-gray-900 text-sm mb-4">
                {section.title}
              </h2>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-500 hover:text-primary-600 transition-colors duration-200 text-sm"
                        aria-label={`${link.label} profile (opens in new tab)`}
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-gray-500 hover:text-primary-600 transition-colors duration-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className="flex flex-col md:flex-row gap-4 md:gap-8">
              <Link
                href={AUTH_ROUTES.LOGIN}
                className="text-sm text-gray-500 hover:text-primary-600 transition-colors duration-200"
              >
                Sign In
              </Link>
              <Link
                href={AUTH_ROUTES.SIGNUP}
                className="text-sm text-gray-500 hover:text-primary-600 transition-colors duration-200"
              >
                Create Account
              </Link>
            </div>
            <div className="text-sm text-gray-600 text-center md:text-right">
              <p>
                © {getCurrentYear()} Video Coaching Platform. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;