/**
 * zpk.js — ZPK Protocol SDK
 * AIFS Protocol Inc. · 2026
 *
 * The complete ZPK developer interface.
 * One script tag. Two functions.
 *
 * Usage:
 *   <script src="https://zpkpay.com/zpk.js"></script>
 *
 *   const dna = await zpk.shatter(isoMessage, walletAddress);
 *   const iso = await zpk.materialize(dna, walletAddress);
 *
 * What happens behind the scenes:
 *   shatter()    — scrambles payload locally, sends noise to API, returns DNA anchor
 *   materialize() — fetches noise from API, unscrambles locally, returns plaintext
 *
 * The server never receives plaintext. Ever.
 * ShatterEngine stays server-side. Core IP stays ours.
 *
 * Patent pending · AIFS Protocol Inc. · 2026
 */

'use strict';

// ── Internal constants ──────────────────────────────────────────
const ZPK_API          = 'https://api.aifs.dev/api/v1';
const ZPK_SALT         = 'AIFS-ZPK-PRE-SHATTER-V1';
const ZPK_PBKDF2_ITER  = 100000;
const ZPK_KEY_BITS     = 256;

// ── Internal: key derivation ────────────────────────────────────
async function _deriveKey(walletAddress) {
    const enc = new TextEncoder();
    const raw = await crypto.subtle.importKey(
        'raw',
        enc.encode(walletAddress.toLowerCase().trim()),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: enc.encode(ZPK_SALT), iterations: ZPK_PBKDF2_ITER, hash: 'SHA-256' },
        raw,
        ZPK_KEY_BITS
    );
    return new Uint8Array(bits);
}

// ── Internal: XOR stream (its own inverse) ──────────────────────
function _xor(data, key) {
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length];
    return out;
}

// ── Internal: scramble ──────────────────────────────────────────
async function _scramble(plaintext, walletAddress) {
    const key  = await _deriveKey(walletAddress);
    const data = new TextEncoder().encode(plaintext);
    return btoa(String.fromCharCode(..._xor(data, key)));
}

// ── Internal: unscramble ────────────────────────────────────────
async function _unscramble(b64, walletAddress) {
    const key      = await _deriveKey(walletAddress);
    const scrambled = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return new TextDecoder().decode(_xor(scrambled, key));
}

// ── Public SDK ──────────────────────────────────────────────────
const zpk = {

    /**
     * Shatter an ISO 20022 message (or any string payload).
     * Payload is scrambled locally before leaving the browser.
     * Returns a DNA anchor for onchain settlement.
     *
     * @param {string} payload       - ISO 20022 XML or any string
     * @param {string} walletAddress - Sender wallet address
     * @param {object} [options]
     * @param {string} [options.receiverAddress]       - Receiver wallet address
     * @param {boolean} [options.allowSenderReassembly] - Allow sender to materialize (default: true)
     * @returns {Promise<string>} DNA anchor (24-char hex string)
     *
     * @example
     * const dna = await zpk.shatter(isoXml, 'rSenderWallet...');
     */
    async shatter(payload, walletAddress, options = {}) {
        if (!payload)       throw new Error('zpk.shatter: payload is required');
        if (!walletAddress) throw new Error('zpk.shatter: walletAddress is required');

        const scrambled = await _scramble(payload, walletAddress);

        const res = await fetch(`${ZPK_API}/liquify`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                manifest:              scrambled,
                originAddress:         walletAddress,
                receiverAddress:       options.receiverAddress || walletAddress,
                allowSenderReassembly: options.allowSenderReassembly !== false
            })
        });

        if (!res.ok) throw new Error(`zpk.shatter: API error ${res.status}`);
        const data = await res.json();
        if (!data.success || !data.dna) throw new Error(data.error || 'zpk.shatter: failed');

        return data.dna;
    },

    /**
     * Materialize a shattered payload using a DNA anchor.
     * Noise is fetched from the API and unscrambled locally.
     * The server never returns readable data.
     *
     * @param {string} dna           - DNA anchor returned by zpk.shatter()
     * @param {string} walletAddress - Authorized wallet address (sender or receiver)
     * @param {object} [options]
     * @param {string} [options.authType]   - Auth method: 'xaman' | 'wallet' (default: 'wallet')
     * @param {string} [options.xamanUuid]  - Xaman UUID if authType is 'xaman'
     * @returns {Promise<string>} Original plaintext payload
     *
     * @example
     * const iso = await zpk.materialize(dna, 'rReceiverWallet...');
     */
    async materialize(dna, walletAddress, options = {}) {
        if (!dna)           throw new Error('zpk.materialize: dna is required');
        if (!walletAddress) throw new Error('zpk.materialize: walletAddress is required');

        const res = await fetch(`${ZPK_API}/materialize/${dna}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                address:   walletAddress,
                authType:  options.authType  || 'wallet',
                xamanUuid: options.xamanUuid || null,
                timestamp: Date.now()
            })
        });

        if (!res.ok) throw new Error(`zpk.materialize: API error ${res.status}`);
        const data = await res.json();

        if (!data.success) {
            if (data.error === 'IDENTITY_MISMATCH')          throw new Error('Wallet not authorized for this record.');
            if (data.error === 'SENDER_REASSEMBLY_DISABLED') throw new Error('Only the receiver can materialize this record.');
            throw new Error(data.error || 'zpk.materialize: failed');
        }

        return await _unscramble(data.data, walletAddress);
    },

    /**
     * Verify that a DNA anchor was generated by the ZPK engine.
     * Checks format only -- does not hit the API.
     *
     * @param {string} dna - DNA anchor to verify
     * @returns {boolean}
     *
     * @example
     * zpk.verify('A3F8B2C91D4E7F60A1B2C3D4'); // true
     */
    verify(dna) {
        return typeof dna === 'string' && /^[0-9A-F]{24}$/.test(dna);
    },

    /**
     * SDK version and endpoint info.
     */
    version: '1.0.0-pilot',
    api:     ZPK_API
};

// Expose globally
if (typeof window !== 'undefined') window.zpk = zpk;
if (typeof module !== 'undefined') module.exports = zpk;
