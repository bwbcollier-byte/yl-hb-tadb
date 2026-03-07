/**
 * enrich-tadb.js
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

async function fetchMBIDS() {
    console.log('🔍 Fetching MusicBrainz profiles from Supabase...');
    
    // For large runs, we limit/batch, but here we prioritize those not yet checked by TADB
    // We can use ml_check column to track TADB status if it exists, or check absence of 'AudioDB' social entry.
    // For now, let's just get 500 records where social_type is MusicBrainz
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
        .limit(500);

    if (error) {
        console.error('❌ Error fetching MBIDs:', error.message);
        return [];
    }
    return data;
}

async function enrichArtist(mbid, talentId, artistName) {
    if (!mbid) return;
    
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
            if (link && link.trim() !== '') {
                // AudioDB sometimes has just the handle or full URL
                // We'll normalize if we can or just store as URL
                await upsertSocial({
                    talent_id: talentId,
                    social_type: hbType,
                    social_url: link.startsWith('http') ? link : `https://${link}`,
                    status: 'enriched_from_tadb'
                });
            }
        }

        // 3. Optional: Sync name/country to talent_profiles if missing?
        // Let's at least update talent_profiles.tadb_id or similar if the column exists.
        // For now, we'll stick to social_profiles as requested.

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
        const mbid = row.social_id;
        const talentId = row.talent_id;
        const artistName = row.talent_profiles?.name || 'Unknown Artist';

        console.log(`\n[${i + 1}/${profiles.length}] 🎵 Processing: ${artistName}`);
        
        await enrichArtist(mbid, talentId, artistName);

        // Respect TADB rate limits (2.5 requests per second for premium? Let's use 1s delay)
        await sleep(1000);
    }

    console.log('\n🏁 Enrichment Complete!');
}

main().catch(console.error);
