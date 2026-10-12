import { brand } from './brand';

export type CodersvoiceSocial = {
  label: 'Instagram' | 'LinkedIn' | 'GitHub' | 'YouTube';
  url: string;
};

export const siteConfig = {
  productName: brand.name,
  codersvoice: {
    name: 'Codersvoice',
    url: 'https://codersvoice.me',
    // Add only verified Codersvoice account URLs here. The footer renders these automatically.
    socialLinks: [] as CodersvoiceSocial[],
  },
} as const;
