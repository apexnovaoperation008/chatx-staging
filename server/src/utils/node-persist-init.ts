import fs from 'fs';
import path from 'path';

/**
 * Node-persist Storage Initialization Utility
 * 
 * This utility ensures that the required node-persist storage directories
 * are created before the application starts, preventing the "Unhandled Promise Rejection"
 * error that occurs when node-persist tries to access non-existent storage directories.
 */

export interface NodePersistInitOptions {
  /** Base directory for node-persist storage (default: process.cwd()) */
  baseDir?: string;
  /** Whether to enable verbose logging (default: false) */
  verbose?: boolean;
}

/**
 * Initialize node-persist storage directories
 * 
 * @param options Configuration options for initialization
 * @returns Promise that resolves when initialization is complete
 */
export async function initializeNodePersistStorage(options: NodePersistInitOptions = {}): Promise<void> {
  const { baseDir = process.cwd(), verbose = false } = options;
  
  try {
    if (verbose) {
      console.log('🔄 Initializing node-persist storage directories...');
    }
    
    // Define the required directories
    const nodePersistDir = path.join(baseDir, '.node-persist');
    const storageDir = path.join(nodePersistDir, 'storage');
    
    // Create directories if they don't exist
    await ensureDirectoryExists(nodePersistDir, verbose);
    await ensureDirectoryExists(storageDir, verbose);
    
    if (verbose) {
      console.log(`✅ Node-persist storage initialized successfully`);
      console.log(`📁 Storage directory: ${storageDir}`);
    }
    
    // Verify directories are writable
    await verifyDirectoryWritable(storageDir, verbose);
    
  } catch (error) {
    console.error('❌ Failed to initialize node-persist storage:', error);
    throw error;
  }
}

/**
 * Ensure a directory exists, creating it if necessary
 * 
 * @param dirPath Path to the directory
 * @param verbose Whether to enable verbose logging
 */
async function ensureDirectoryExists(dirPath: string, verbose: boolean): Promise<void> {
  try {
    await fs.promises.access(dirPath, fs.constants.F_OK);
    if (verbose) {
      console.log(`📁 Directory already exists: ${dirPath}`);
    }
  } catch (error) {
    // Directory doesn't exist, create it
    await fs.promises.mkdir(dirPath, { recursive: true });
    if (verbose) {
      console.log(`📁 Created directory: ${dirPath}`);
    }
  }
}

/**
 * Verify that a directory is writable
 * 
 * @param dirPath Path to the directory
 * @param verbose Whether to enable verbose logging
 */
async function verifyDirectoryWritable(dirPath: string, verbose: boolean): Promise<void> {
  try {
    const testFile = path.join(dirPath, '.write-test');
    
    // Try to write a test file
    await fs.promises.writeFile(testFile, 'test');
    
    // Clean up the test file
    await fs.promises.unlink(testFile);
    
    if (verbose) {
      console.log(`✅ Directory is writable: ${dirPath}`);
    }
  } catch (error) {
    throw new Error(`Directory is not writable: ${dirPath} - ${error}`);
  }
}

/**
 * Check if node-persist storage is properly initialized
 * 
 * @param baseDir Base directory for node-persist storage (default: process.cwd())
 * @returns Promise that resolves to true if initialized, false otherwise
 */
export async function isNodePersistStorageInitialized(baseDir: string = process.cwd()): Promise<boolean> {
  try {
    const nodePersistDir = path.join(baseDir, '.node-persist');
    const storageDir = path.join(nodePersistDir, 'storage');
    
    // Check if both directories exist and are accessible
    await fs.promises.access(nodePersistDir, fs.constants.F_OK);
    await fs.promises.access(storageDir, fs.constants.F_OK);
    
    // Check if storage directory is writable
    await verifyDirectoryWritable(storageDir, false);
    
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get the node-persist storage path
 * 
 * @param baseDir Base directory for node-persist storage (default: process.cwd())
 * @returns The path to the node-persist storage directory
 */
export function getNodePersistStoragePath(baseDir: string = process.cwd()): string {
  return path.join(baseDir, '.node-persist', 'storage');
}
