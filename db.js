const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL || '', SUPABASE_KEY || '');

function clean(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined && v !== null && v !== '') out[k] = v;
    }
    return out;
}

/**
 * Upsert social profile by (talent_id, social_type)
 */
async function upsertSocial(payload) {
    const data = clean(payload);
    if (!data.talent_id || !data.social_type) return;

    // Find existing
    const { data: existing, error: findError } = await supabase
        .from('social_profiles')
        .select('id')
        .eq('talent_id', data.talent_id)
        .eq('social_type', data.social_type)
        .maybeSingle();

    if (findError) {
        console.error(`   ❌ Error finding social ${data.social_type}:`, findError.message);
        return null;
    }

    if (existing) {
        const { data: updated, error: updateError } = await supabase
            .from('social_profiles')
            .update({ ...data, updated_at: new Date().toISOString() })
            .eq('id', existing.id)
            .select()
            .single();
        if (updateError) console.error(`   ❌ Update fail: ${data.social_type}`, updateError.message);
        return updated;
    } else {
        const { data: inserted, error: insertError } = await supabase
            .from('social_profiles')
            .insert({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .select()
            .single();
        if (insertError) console.error(`   ❌ Insert fail: ${data.social_type}`, insertError.message);
        return inserted;
    }
}

module.exports = {
    supabase,
    upsertSocial,
    clean
};
