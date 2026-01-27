import { invoke } from '@tauri-apps/api/core'

// TypeScript types for the keyring plugin
export type CredentialType = 'Password' | 'Secret'

export interface CredentialValue {
    type: 'Password' | 'Secret'
    data: string | number[]
}

// Initialize the keyring service with a service name
export async function initializeKeyring(serviceName: string): Promise<void> {
    return await invoke('plugin:keyring|initialize_keyring', {
        serviceName,
    })
}

// Password operations
export async function setPassword(username: string, password: string): Promise<void> {
    return await invoke('plugin:keyring|set_password', {
        username,
        password,
    })
}

export async function getPassword(username: string): Promise<string> {
    return await invoke('plugin:keyring|get_password', {
        username,
    })
}

export async function deletePassword(username: string): Promise<void> {
    return await invoke('plugin:keyring|delete_password', {
        username,
    })
}

export async function hasPassword(username: string): Promise<boolean> {
    return await invoke('plugin:keyring|has_password', {
        username,
    })
}

// Secret operations (for binary data)
export async function setSecret(username: string, secret: number[]): Promise<void> {
    return await invoke('plugin:keyring|set_secret', {
        username,
        secret,
    })
}

export async function getSecret(username: string): Promise<number[]> {
    return await invoke('plugin:keyring|get_secret', {
        username,
    })
}

export async function deleteSecret(username: string): Promise<void> {
    return await invoke('plugin:keyring|delete_secret', {
        username,
    })
}

export async function hasSecret(username: string): Promise<boolean> {
    return await invoke('plugin:keyring|has_secret', {
        username,
    })
}

// Convenience functions for common use cases
export const keyring = {
    initialize: initializeKeyring,
    password: {
        set: setPassword,
        get: getPassword,
        delete: deletePassword,
        exists: hasPassword,
    },
    secret: {
        set: setSecret,
        get: getSecret,
        delete: deleteSecret,
        exists: hasSecret,
    },
}

export default keyring
