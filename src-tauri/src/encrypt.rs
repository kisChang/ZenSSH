use data_encoding::{BASE64, HEXLOWER};
use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM, NONCE_LEN};
use ring::pbkdf2::{self, PBKDF2_HMAC_SHA256};
use ring::rand::{SecureRandom, SystemRandom};
use std::num::NonZeroU32;
use tauri::command;

const PBKDF2_ITER: NonZeroU32 = unsafe { NonZeroU32::new_unchecked(100_000) };
const SALT_LEN: usize = 16;

// 派生 32 字节的 AES 密钥
#[command]
pub fn encrypt_derive_key(password: &str, salt: &str) -> Result<String, String> {
    let salt = HEXLOWER
        .decode(salt.as_bytes())
        .map_err(|e| format!("salt decode error: {e:?}"))?;
    let mut key = [0u8; 32];
    pbkdf2::derive(
        PBKDF2_HMAC_SHA256,
        PBKDF2_ITER,
        &salt,
        password.as_bytes(),
        &mut key,
    );
    Ok(BASE64.encode(&key))
}

// 生成随机 salt
#[command]
pub fn encrypt_gen_salt() -> String {
    let mut salt = [0u8; SALT_LEN];
    SystemRandom::new().fill(&mut salt).unwrap();
    HEXLOWER.encode(&salt)
}

// 加密：输入明文 & base64 key → 返回 (base64 密文, base64 nonce)
#[command]
pub fn encrypt_encrypt_data(plaintext: &str, key_b64: &str) -> Result<(String, String), String> {
    let key_bytes = BASE64
        .decode(key_b64.as_bytes())
        .map_err(|e| format!("key decode failed: {:?}", e))?;
    let mut key_array = [0u8; 32];
    key_array.copy_from_slice(&key_bytes[..32]);

    // 生成随机 nonce
    let mut nonce_bytes = [0u8; NONCE_LEN];
    SystemRandom::new().fill(&mut nonce_bytes).unwrap();

    let unbound_key =
        UnboundKey::new(&AES_256_GCM, &key_array).map_err(|e| format!("key error: {:?}", e))?;
    let less_safe_key = LessSafeKey::new(unbound_key);

    let nonce = Nonce::assume_unique_for_key(nonce_bytes);

    // 加密需要预留 tag 空间
    let mut in_out = plaintext.as_bytes().to_vec();

    less_safe_key
        .seal_in_place_append_tag(nonce, Aad::empty(), &mut in_out)
        .map_err(|e| format!("encrypt failed: {:?}", e))?;

    Ok((BASE64.encode(&in_out), BASE64.encode(&nonce_bytes)))
}

// 解密：输入 base64 密文 & base64 nonce & base64 key
#[command]
pub fn encrypt_decrypt_data(
    cipher_b64: &str,
    nonce_b64: &str,
    key_b64: &str,
) -> Result<String, String> {
    let mut cipher_bytes = BASE64
        .decode(cipher_b64.as_bytes())
        .map_err(|e| format!("cipher decode failed: {:?}", e))?;
    let nonce_bytes = BASE64
        .decode(nonce_b64.as_bytes())
        .map_err(|e| format!("nonce decode failed: {:?}", e))?;

    let key_bytes = BASE64
        .decode(key_b64.as_bytes())
        .map_err(|e| format!("key decode failed: {:?}", e))?;
    let mut key_array = [0u8; 32];
    key_array.copy_from_slice(&key_bytes[..32]);

    let nonce = Nonce::try_assume_unique_for_key(nonce_bytes.as_ref())
        .map_err(|e| format!("nonce error: {:?}", e))?;

    let unbound_key =
        UnboundKey::new(&AES_256_GCM, &key_array).map_err(|e| format!("key error: {:?}", e))?;
    let less_safe_key = LessSafeKey::new(unbound_key);

    let plain = less_safe_key
        .open_in_place(nonce, Aad::empty(), &mut cipher_bytes)
        .map_err(|e| format!("decrypt failed: {:?}", e))?;

    let plaintext =
        String::from_utf8(plain.to_vec()).map_err(|e| format!("utf8 decode failed: {:?}", e))?;

    Ok(plaintext)
}
