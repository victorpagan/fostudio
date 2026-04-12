import path from 'node:path'

export const ANALYTICS_ROOT = path.resolve(process.cwd(), 'admin/analytics')
export const INPUTS_DIR = path.join(ANALYTICS_ROOT, 'inputs')
export const NORMALIZED_DIR = path.join(ANALYTICS_ROOT, 'normalized')
export const OUTPUTS_DIR = path.join(ANALYTICS_ROOT, 'outputs')

export const RAW_MEMBERSHIPS_PATH = path.join(NORMALIZED_DIR, 'memberships.raw.json')
export const RAW_BOOKINGS_PATH = path.join(NORMALIZED_DIR, 'bookings.raw.json')
export const RAW_REVENUE_PATH = path.join(NORMALIZED_DIR, 'revenue.raw.json')
export const RAW_OPS_PATH = path.join(NORMALIZED_DIR, 'ops.raw.json')
export const RAW_ADS_PATH = path.join(NORMALIZED_DIR, 'ads.raw.json')

export const NORMALIZED_MEMBERSHIPS_PATH = path.join(NORMALIZED_DIR, 'memberships.json')
export const NORMALIZED_MEMBERSHIP_STATE_PATH = path.join(NORMALIZED_DIR, 'memberships_state.json')
export const NORMALIZED_BOOKINGS_PATH = path.join(NORMALIZED_DIR, 'bookings.json')
export const NORMALIZED_REVENUE_PATH = path.join(NORMALIZED_DIR, 'revenue_events.json')
export const NORMALIZED_OPS_PATH = path.join(NORMALIZED_DIR, 'ops.json')
export const NORMALIZED_ADS_PATH = path.join(NORMALIZED_DIR, 'ads.json')

export const METRICS_OUTPUT_PATH = path.join(OUTPUTS_DIR, 'metrics.json')
export const TRENDS_OUTPUT_PATH = path.join(OUTPUTS_DIR, 'trends.json')
export const ALERTS_OUTPUT_PATH = path.join(OUTPUTS_DIR, 'alerts.json')
export const WEEKLY_REPORT_MD_PATH = path.join(OUTPUTS_DIR, 'weekly-report.md')
export const WEEKLY_REPORT_JSON_PATH = path.join(OUTPUTS_DIR, 'weekly-report.json')

export const INPUT_MEMBERSHIPS_CSV_PATH = path.join(INPUTS_DIR, 'memberships.csv')
export const INPUT_BOOKINGS_CSV_PATH = path.join(INPUTS_DIR, 'bookings.csv')
export const INPUT_REVENUE_CSV_PATH = path.join(INPUTS_DIR, 'revenue.csv')
export const INPUT_ADS_META_CSV_PATH = path.join(INPUTS_DIR, 'ads_meta.csv')
export const INPUT_ADS_GOOGLE_CSV_PATH = path.join(INPUTS_DIR, 'ads_google.csv')
