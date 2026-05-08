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
 * Upsert social profile by (linked_talent, type)
 */
async function upsertSocial(payload) {
    const data = clean(payload);
    if (!data.linked_talent || !data.type) return;

    // Find existing
    const { data: existing, error: findError } = await supabase
        .from('hb_socials')
        .select('id')
        .eq('linked_talent', data.linked_talent)
        .eq('type', data.type)
        .maybeSingle();

    if (findError) {
        console.error(`   ❌ Error finding social ${data.type}:`, findError.message);
        return null;
    }

    if (existing) {
        const { data: updated, error: updateError } = await supabase
            .from('hb_socials')
            .update({ ...data, updated_at: new Date().toISOString() })
            .eq('id', existing.id)
            .select()
            .single();
        if (updateError) console.error(`   ❌ Update fail: ${data.type}`, updateError.message);
        return updated;
    } else {
        const { data: inserted, error: insertError } = await supabase
            .from('hb_socials')
            .insert({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .select()
            .single();
        if (insertError) console.error(`   ❌ Insert fail: ${data.type}`, insertError.message);
        return inserted;
    }
}

module.exports = {
    supabase,
    upsertSocial,
    clean
};
