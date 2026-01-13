import { CryptoUtils } from './CryptoUtils.js';
import { db } from '../config/db.js';
import { user_keys } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

// manage cryptographic keys for blockchain users
export class KeyManager {
    
    // generate and store new key pair for user
    static async generateKeysForUser(userId) {
        try {
            const { privateKey, publicKey } = CryptoUtils.generateKeyPair();
            
            // rncrypt private key
            const encryptedPrivateKey = this.encryptPrivateKey(privateKey, userId);
            
            // check user already has keys
            const existing = await db.select()
                .from(user_keys)
                .where(eq(user_keys.user_id, userId));
            
            if (existing.length > 0) {
                // update existing keys
                await db.update(user_keys)
                    .set({
                        public_key: publicKey,
                        encrypted_private_key: encryptedPrivateKey,
                        key_version: existing[0].key_version + 1,
                        updated_at: new Date()
                    })
                    .where(eq(user_keys.user_id, userId));
            } else {
                // insert new keys
                await db.insert(user_keys).values({
                    user_id: userId,
                    public_key: publicKey,
                    encrypted_private_key: encryptedPrivateKey,
                    key_version: 1,
                    is_active: true
                });
            }
            
            return {
                publicKey,
                privateKey,
                keyVersion: existing.length > 0 ? existing[0].key_version + 1 : 1
            };
        } catch (error) {
            console.error('[BC] Error generating keys:', error.message);
            throw new Error('Failed to generate keys for user');
        }
    }
    
    // get user public key - auto-generate if not exists
    static async getPublicKey(userId) {
        try {
            const result = await db.select()
                .from(user_keys)
                .where(eq(user_keys.user_id, userId));
            
            if (result.length === 0) {
                // Auto-generate keys if they don't exist
                console.log(`[BC] Auto-generating keys for user ${userId}...`);
                const { publicKey } = await this.generateKeysForUser(userId);
                return publicKey;
            }
            
            return result[0].public_key;
        } catch (error) {
            console.error('[BC] Error fetching public key:', error.message);
            return null;
        }
    }
    
    // get user private key - decrypted - auto-generate if not exists
    static async getPrivateKey(userId, password = null) {
        try {
            let result = await db.select()
                .from(user_keys)
                .where(eq(user_keys.user_id, userId));
            
            if (result.length === 0) {
                // Auto-generate keys if they don't exist
                console.log(`[BC] Auto-generating keys for user ${userId}...`);
                const generated = await this.generateKeysForUser(userId);
                return generated.privateKey;
            }
            
            if (!result[0].is_active) {
                throw new Error('User keys are deactivated');
            }
            
            // decrypt private key
            const privateKey = this.decryptPrivateKey(
                result[0].encrypted_private_key, 
                userId, 
                password
            );
            
            return privateKey;
        } catch (error) {
            console.error('[BC] Error fetching private key:', error.message);
            throw error;
        }
    }
    
    // encrypt private key (using AES-256-GCM) 
    static encryptPrivateKey(privateKey, userId) {
        const secret = this.getEncryptionSecret(userId);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', secret, iv);
        
        let encrypted = cipher.update(privateKey, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();

        return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    }
    
    // decrypt private key
    static decryptPrivateKey(encryptedData, userId, password = null) {
        try {
            const parts = encryptedData.split(':');
            if (parts.length !== 3) {
                throw new Error('Invalid encrypted key format');
            }
            
            const iv = Buffer.from(parts[0], 'hex');
            const authTag = Buffer.from(parts[1], 'hex');
            const encrypted = parts[2];
            
            const secret = this.getEncryptionSecret(userId, password);
            const decipher = crypto.createDecipheriv('aes-256-gcm', secret, iv);
            decipher.setAuthTag(authTag);
            
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            console.error('[BC] Decryption failed:', error.message);
            throw new Error('Failed to decrypt private key');
        }
    }
    
    // get encryption secret (derived from JWT_SECRET + userId)
    static getEncryptionSecret(userId, password = null) {
        const base = password || process.env.JWT_SECRET || 'default-secret-change-me';
        const combined = `${base}:${userId}`;
        
        return crypto.createHash('sha256').update(combined).digest();
    }
    
    // deactivate user keys
    static async deactivateKeys(userId) {
        try {
            await db.update(user_keys)
                .set({
                    is_active: false,
                    updated_at: new Date()
                })
                .where(eq(user_keys.user_id, userId));
            
            return true;
        } catch (error) {
            console.error('[BC] Error deactivating keys:', error.message);
            return false;
        }
    }
    
    // reactivate user keys
    static async reactivateKeys(userId) {
        try {
            await db.update(user_keys)
                .set({
                    is_active: true,
                    updated_at: new Date()
                })
                .where(eq(user_keys.user_id, userId));
            
            return true;
        } catch (error) {
            console.error('[BC] Error reactivating keys:', error.message);
            return false;
        }
    }
    
    // check user has keys
    static async hasKeys(userId) {
        try {
            const result = await db.select()
                .from(user_keys)
                .where(eq(user_keys.user_id, userId));
            
            return result.length > 0 && result[0].is_active;
        } catch (error) {
            console.error('[BC] Error checking keys:', error.message);
            return false;
        }
    }
    
    // get key information (without private key)
    static async getKeyInfo(userId) {
        try {
            const result = await db.select()
                .from(user_keys)
                .where(eq(user_keys.user_id, userId));
            
            if (result.length === 0) {
                return null;
            }
            
            return {
                userId: result[0].user_id,
                publicKey: result[0].public_key,
                keyVersion: result[0].key_version,
                isActive: result[0].is_active,
                createdAt: result[0].created_at,
                updatedAt: result[0].updated_at
            };
        } catch (error) {
            console.error('[BC] Error fetching key info:', error.message);
            return null;
        }
    }
    
    // validate key pair
    static validateKeyPair(privateKey, publicKey) {
        try {
            const testData = 'test-validation-data';
            const signature = CryptoUtils.signData(privateKey, testData);
            return CryptoUtils.verifySignature(publicKey, testData, signature);
        } catch (error) {
            console.error('[BC] Key validation failed:', error.message);
            return false;
        }
    }
}
