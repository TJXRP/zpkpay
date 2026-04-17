/**
 * pre-shatter.js
 * ZPK Client-Side Entropy Pre-Processor
 *
 * Scrambles a payload in the browser before it leaves the device.
 * The server never receives plaintext. Ever.
 *
 * Two functions only:
 *   preShatter(plaintext, walletAddress)  → scrambled base64 string
 *   postAssemble(scrambledB64, walletAddress) → original plaintext
 *
 * Algorithm:
 *   1. Derive a 256-bit key from the wallet address using PBKDF2-SHA256
 *   2. XOR the payload bytes against the key stream (repeating key)
 *   3. Base64 encode the result for safe transport
 *
 * XOR is its own inverse -- same key in both directions.
 * Same wallet address always produces the same key.
 * No key storage. No server dependency. No extra attack surface.
 *
 * Protocol salt: 'AIFS-ZPK-PRE-SHATTER-V1'
 * This salt must never change without a versioned migration.
 * Changing the salt produces a different key from the same wallet address,
 * making all previously scrambled payloads unrecoverable.
 *
 * PBKDF2 iterations: 100,000
 * Chosen for browser performance balance vs brute-force resistance.
 * Do not lower this value.
 *
 * Patent notice: This client-side entropy pre-processing method
 * is part of the ZPK Protocol. Patent filing in progress.
 * AIFS Protocol Inc. 2026.
 */

'use strict';

const PRE_SHATTER_SALT    = 'AIFS-ZPK-PRE-SHATTER-V1';
const PBKDF2_ITERATIONS   = 100000;
const KEY_LENGTH_BITS     = 256;

/**
 * Derive a deterministic 256-bit key from a wallet address.
 * Uses PBKDF2-SHA256 with a fixed protocol salt.
 * Result is always identical for the same wallet address.
 *
 * @param {string} walletAddress - The sender or receiver wallet address
 * @returns {Promise<Uint8Array>} 32-byte key
 */
async function deriveKey(walletAddress) {
    const encoder = new TextEncoder();

    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(walletAddress.toLowerCase().trim()),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
    );

    const keyBits = await crypto.subtle.deriveBits(
        {
            name:       'PBKDF2',
            salt:       encoder.encode(PRE_SHATTER_SALT),
            iterations: PBKDF2_ITERATIONS,
            hash:       'SHA-256'
        },
        keyMaterial,
        KEY_LENGTH_BITS
    );

    return new Uint8Array(keyBits);
}

/**
 * XOR a byte array against a repeating key.
 * XOR is its own inverse -- applying twice with the same key returns the original.
 *
 * @param {Uint8Array} data - Bytes to XOR
 * @param {Uint8Array} key  - Key bytes (repeated as needed)
 * @returns {Uint8Array} XORed bytes
 */
function xorStream(data, key) {
    const result = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
        result[i] = data[i] ^ key[i % key.length];
    }
    return result;
}

/**
 * Scramble a plaintext payload before it leaves the browser.
 * The output is noise to anyone without the wallet address.
 *
 * @param {string} plaintext     - Raw ISO message or any string payload
 * @param {string} walletAddress - Sender wallet address (the cryptographic key)
 * @returns {Promise<string>}    - Base64-encoded scrambled payload
 */
async function preShatter(plaintext, walletAddress) {
    if (!plaintext)     throw new Error('preShatter: plaintext is required');
    if (!walletAddress) throw new Error('preShatter: walletAddress is required');

    const encoder  = new TextEncoder();
    const data     = encoder.encode(plaintext);
    const key      = await deriveKey(walletAddress);
    const scrambled = xorStream(data, key);

    return btoa(String.fromCharCode(...scrambled));
}

/**
 * Unscramble a payload returned from the server after materialize.
 * Recovers the original plaintext using the wallet address as the key.
 *
 * @param {string} scrambledB64  - Base64-encoded scrambled payload from server
 * @param {string} walletAddress - Wallet address used at preShatter time
 * @returns {Promise<string>}    - Original plaintext payload
 */
async function postAssemble(scrambledB64, walletAddress) {
    if (!scrambledB64)  throw new Error('postAssemble: scrambledB64 is required');
    if (!walletAddress) throw new Error('postAssemble: walletAddress is required');

    const scrambled = Uint8Array.from(atob(scrambledB64), c => c.charCodeAt(0));
    const key       = await deriveKey(walletAddress);
    const plain     = xorStream(scrambled, key);

    return new TextDecoder().decode(plain);
}

/**
 * Self-test. Call this in the browser console to verify the module works.
 * Scrambles a sample ISO message and recovers it.
 * Throws if the round-trip fails.
 *
 * Usage: preShatterSelfTest()
 */
async function preShatterSelfTest() {
    const testWallet  = 'rTestWalletAddress123456789';
    const testPayload = '<?xml version="1.0"?><Document><CdtTrfTxInf><IntrBkSttlmAmt Ccy="USD">1000.00</IntrBkSttlmAmt></CdtTrfTxInf></Document>';

    const scrambled  = await preShatter(testPayload, testWallet);
    const recovered  = await postAssemble(scrambled, testWallet);

    if (recovered !== testPayload) {
        throw new Error('preShatterSelfTest FAILED: round-trip mismatch');
    }

    const wrongWallet = 'rWrongWalletAddress987654321';
    const wrongKey    = await postAssemble(scrambled, wrongWallet);

    if (wrongKey === testPayload) {
        throw new Error('preShatterSelfTest FAILED: wrong wallet should not recover plaintext');
    }

    console.log('preShatterSelfTest PASSED');
    console.log('  Original: ', testPayload.substring(0, 60) + '...');
    console.log('  Scrambled:', scrambled.substring(0, 60) + '...');
    console.log('  Recovered:', recovered.substring(0, 60) + '...');
    console.log('  Wrong wallet recovered noise (correct behavior)');
    return true;
}
