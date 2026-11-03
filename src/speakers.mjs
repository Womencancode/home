/* Speakers: public figures an organiser can invite, so a panel need not be all men. Data: data/speakers.json (engine default []) plus
 * approved 'speaker' submissions. With no data and the pack's "speakers" flag off there is no /speakers page and no door to it. */
import list from '../data/speakers.json' with { type: 'json' };
import { PACK } from './site.mjs';

export const SPEAKERS = list;
/** The topics a speaker can be listed under; a submission picks one of these. */
export const TOPICS = ['ai', 'ai-ethics', 'ai-safety', 'research', 'business', 'investment', 'engineering', 'data', 'security', 'privacy', 'policy', 'health', 'education', 'diversity', 'art', 'music', 'film', 'writing', 'sport', 'community'];
export const TOPIC_LABEL = { ai: 'AI', 'ai-ethics': 'AI ethics', 'ai-safety': 'AI safety', research: 'Research', business: 'Business', investment: 'Investment', engineering: 'Engineering', data: 'Data', security: 'Security', privacy: 'Privacy', policy: 'Policy', health: 'Health', education: 'Education', diversity: 'Diversity and inclusion', art: 'Art', music: 'Music', film: 'Film', writing: 'Writing', sport: 'Sport', community: 'Community' };

/** Whether the doors to /speakers show: the site has speakers data, or the pack switches the page on for submissions. */
export const speakersEnabled = (speakers = SPEAKERS, pack = PACK) => speakers.length > 0 || pack.speakers === true;

const EMAILISH = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/** A well formed record: id, name, at least one known topic, a country, an http(s) source page, and nothing that looks like an email. */
export function validSpeaker(s) {
  return !!s && /^[a-z0-9-]{2,80}$/.test(s.id || '') && typeof s.name === 'string' && s.name.length > 1 && Array.isArray(s.topics) && s.topics.length > 0 && s.topics.every((t) => TOPICS.includes(t))
    && /^[A-Z]{2}$/.test(s.country || '') && /^https?:\/\//.test(s.url || '') && typeof s.source === 'string' && !EMAILISH.test(JSON.stringify(s));
}

/** Seed plus approved submissions, filtered by topic and country. */
export function filterSpeakers(all, { topic = '', country = '' } = {}) {
  return all.filter((s) => (!topic || s.topics.includes(topic)) && (!country || s.country === country));
}
