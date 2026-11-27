export type LabSetuLogoVariant = 'full' | 'compact' | 'icon' | 'dark' | 'light';

export interface LabSetuBrandAssetSpec {
  readonly id: 'full' | 'iconOnly';
  readonly relativePath: string;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly defaultAlt: string;
}

export const LABSETU_BRAND_NAME = 'LabSetu';
export const LABSETU_BRAND_TAGLINE = 'Diagnostic Sample Pickup & Lab Network';

export const LABSETU_BRAND_ASSETS: Record<'full' | 'iconOnly', LabSetuBrandAssetSpec> = {
  full: {
    id: 'full',
    relativePath: 'packages/shared/assets/brand/logo/labsetu-logo.png',
    naturalWidth: 1254,
    naturalHeight: 1254,
    defaultAlt: 'LabSetu official logo',
  },
  iconOnly: {
    id: 'iconOnly',
    relativePath: 'packages/shared/assets/brand/icons/labsetu-icon-only.png',
    naturalWidth: 1024,
    naturalHeight: 1024,
    defaultAlt: 'LabSetu icon',
  },
};
