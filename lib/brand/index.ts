export type { BrandId, PublicBrand } from "./types";
export {
  ALL_BRAND_HOSTS,
  BRAND_DEFINITIONS,
  DEFAULT_BRAND_ID,
  getBrandDefinition,
  toPublicBrand,
} from "./brands";
export {
  getBrandForSiteOrigin,
  getBrandFromHost,
  getDefaultPublicBrand,
  isKnownBrandHost,
  normalizeHost,
} from "./resolve";
export {
  creatorNotifyEmailFrom,
  inviteEmailFrom,
  leaderEmailFrom,
  organizerEmailFrom,
  participantEmailFrom,
  welcomeEmailFrom,
} from "./email-from";
export { publicSiteOriginFromRequest } from "./request-origin";
export {
  publicSiteOriginAndBrandForCampaign,
  type CampaignBrandFields,
} from "./campaign-site";
