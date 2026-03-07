/**
 * enrich-tadb.js (Fixed)
 * Pulls MusicBrainz IDs from Supabase and enriches talent using AudioDB.
 */
require('dotenv').config();
const axios = require('axios');
const { supabase, upsertSocial, clean } = require('./db');

const TADB_API_KEY = process.env.TADB_API_KEY || '925704';
const BASE_URL = `https://www.theaudiodb.com/api/v1/json/${TADB_API_KEY}`;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Map AudioDB fields to HB social_type
const TADB_SOCIAL_MAP = {
    'strFacebook': 'Facebook',
    'strTwitter': 'Twitter',
    'strInstagram': 'Instagram',
    'strWebsite': 'Website',
    'strIntLastFM': 'Last.fm',
};

/**
 * Extracts the UUID from a MusicBrainz URL or returns it if already an ID.
 */
function sanitizeMBID(mbid) {
    if (!mbid) return null;
    // Match UUID pattern (8-4-4-4-12 hex chars)
    const uuidMatch = mbid.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return uuidMatch ? uuidMatch[0] : null;
}

async function fetchMBIDS() {
    console.log('🔍 Fetching MusicBrainz profiles from Supabase...');
    
    // Attempt to find MusicBrainz profiles where we haven't successfully pulled AudioDB info yet
    const { data, error } = await supabase
        .from('social_profiles')
        .select(`
            talent_id,
            social_id,
            social_url,
            talent_profiles!talent_id (
                id,
                name
            )
        `)
        .eq('social_type', 'MusicBrainz')
        .not('social_id', 'is', null)
        .limit(100); // Process in smaller batches

    if (error) {
        console.error('❌ Error fetching MBIDs:', error.message);
        return [];
    }
    return data;
}

async function enrichArtist(mbidRaw, talentId, artistName) {
    const mbid = sanitizeMBID(mbidRaw);
    if (!mbid) {
        console.log(`      ⚠️  Invalid MBID format: ${mbidRaw}`);
        return;
    }
    
    const url = `${BASE_URL}/artist-mb.php?i=${mbid}`;
    console.log(`   📡 Calling AudioDB for ${artistName} (MBID: ${mbid})...`);
    
    try {
        const response = await axios.get(url, { timeout: 10000 });
        const artists = response.data?.artists;

        if (!artists || !Array.isArray(artists) || artists.length === 0) {
            console.log(`      ⚠️  No artist found on AudioDB for ${artistName}`);
            return;
        }

        const artist = artists[0];
        console.log(`      ✨ Found AudioDB ID: ${artist.idArtist}`);

        // 1. Create/Update AudioDB social profile
        await upsertSocial({
            talent_id: talentId,
            social_type: 'AudioDB',
            social_id: artist.idArtist,
            social_url: `https://theaudiodb.com/artist/${artist.idArtist}`,
            social_about: artist.strBiographyEN,
            social_image: artist.strArtistThumb,
            status: 'done'
        });

        // 2. Extract and update other socials found in AudioDB
        for (const [tadbKey, hbType] of Object.entries(TADB_SOCIAL_MAP)) {
            const link = artist[tadbKey];
            if (link && link.trim() !== '' && link !== '0' && link !== '1') {
                // AudioDB sometimes has just the handle or full URL
                let fullUrl = link;
                if (!link.startsWith('http')) {
                    if (hbType === 'Facebook') fullUrl = `https://www.facebook.com/${link}`;
                    else if (hbType === 'Twitter') fullUrl = `https://twitter.com/${link}`;
                    else if (hbType === 'Instagram') fullUrl = `https://www.instagram.com/${link}`;
                    else if (hbType === 'Website') fullUrl = `https://${link}`;
                }

                await upsertSocial({
                    talent_id: talentId,
                    social_type: hbType,
                    social_url: fullUrl,
                    status: 'enriched_from_tadb'
                });
            }
        }

    } catch (e) {
        console.error(`      ❌ AudioDB Request failed: ${e.message}`);
    }
}

async function main() {
    console.log('🚀 Starting TADB Enrichment Pipeline...');
    
    const profiles = await fetchMBIDS();
    console.log(`📋 Found ${profiles.length} profiles to check.`);

    for (let i = 0; i < profiles.length; i++) {
        const row = profiles[i];
        const mbidRaw = row.social_id || row.social_url;
        const talentId = row.talent_id;
        const artistName = row.talent_profiles?.name || 'Unknown Artist';

        console.log(`\n[${i + 1}/${profiles.length}] 🎵 Processing: ${artistName}`);
        
        await enrichArtist(mbidRaw, talentId, artistName);

        // Respect TADB rate limits (1s delay)
        await sleep(1000);
    }

    console.log('\n🏁 Enrichment Complete!');
}

main().catch(console.error);
