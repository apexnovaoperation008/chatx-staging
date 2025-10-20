import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Mask phone number for display
 * Intelligently detects country code length and masks accordingly
 * Example: 60107677213 -> 60******213 (Malaysia - 2 digit country code)
 * Example: 855000001 -> 855***001 (Cambodia - 3 digit country code)
 */
export function maskPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber || phoneNumber.length < 4) return phoneNumber;

  // Remove any non-digit characters
  const digits = phoneNumber.replace(/\D/g, '');

  if (digits.length <= 4) return phoneNumber;

  // Detect country code by trying different lengths
  let countryCodeLength = 2; // Default for most countries

  // Check for 3-digit country codes first (more specific)
  if (digits.length >= 6) {
    const threeDigitPrefix = digits.slice(0, 3);
    // Common 3-digit country codes
    const threeDigitCodes = ['212', '213', '216', '218', '220', '221', '222', '223', '224', '225', '226', '227', '228', '229', '230', '231', '232', '233', '234', '235', '236', '237', '238', '239', '240', '241', '242', '243', '244', '245', '246', '248', '249', '250', '251', '252', '253', '254', '255', '256', '257', '258', '260', '261', '262', '263', '264', '265', '266', '267', '268', '269', '290', '291', '297', '298', '299', '350', '351', '352', '353', '354', '355', '356', '357', '358', '359', '370', '371', '372', '373', '374', '375', '376', '377', '378', '380', '381', '382', '383', '385', '386', '387', '389', '420', '421', '423', '500', '501', '502', '503', '504', '505', '506', '507', '508', '509', '590', '591', '592', '593', '594', '595', '596', '597', '598', '599', '670', '672', '673', '674', '675', '676', '677', '678', '679', '680', '681', '682', '683', '684', '685', '686', '687', '688', '689', '690', '691', '692', '850', '852', '853', '855', '856', '880', '886', '960', '961', '962', '963', '964', '965', '966', '967', '968', '970', '971', '972', '973', '974', '975', '976', '977', '992', '993', '994', '995', '996', '998'];

    if (threeDigitCodes.includes(threeDigitPrefix)) {
      countryCodeLength = 3;
    }
  }

  // Check for 1-digit country codes
  if (countryCodeLength === 2 && digits.length >= 4) {
    const oneDigitPrefix = digits.slice(0, 1);
    if (oneDigitPrefix === '1' || oneDigitPrefix === '7') {
      countryCodeLength = 1;
    }
  }

  // Keep country code and last 3 digits, mask the middle
  const countryCode = digits.slice(0, countryCodeLength);
  const lastThree = digits.slice(-3);
  const middleLength = digits.length - countryCodeLength - 3;

  if (middleLength <= 0) return phoneNumber; // Not enough digits to mask

  return `${countryCode}${'*'.repeat(middleLength)}${lastThree}`;
}

/**
 * Mask username for display
 * Example: John -> J***n
 */
export function maskUsername(username: string): string {
  if (!username || username.length <= 2) return username;

  // Keep first and last character, mask the middle
  const firstChar = username.charAt(0);
  const lastChar = username.charAt(username.length - 1);
  const middleLength = username.length - 2;

  if (middleLength <= 0) return username;

  return `${firstChar}${'*'.repeat(middleLength)}${lastChar}`;
}

/**
 * Check if a string looks like a phone number (contains only digits, starts with country code)
 */
export function isPhoneNumber(str: string): boolean {
  const digits = str.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15 && /^\d+$/.test(digits);
}

/**
 * Check if a string looks like a username/nickname vs original name
 * Usernames are typically short, single words without spaces or very few words
 */
export function isUsername(name: string): boolean {
  if (!name || name.length > 50) return false; // Too long for username

  // Contains spaces - likely an original name
  if (name.includes(' ')) return false;

  // Contains Chinese characters - likely an original name
  if (/[\u4e00-\u9fa5]/.test(name)) return false;

  // Very short (1-2 chars) - could be username
  if (name.length <= 2) return true;

  // Medium length single words - likely username
  if (name.length <= 15 && !name.includes('.') && !name.includes('@')) return true;

  return false;
}

/**
 * Mask chat name based on its content
 * - If it looks like a phone number, mask it as phone number
 * - If it looks like a username/nickname, mask it as username
 * - Otherwise, return as is (assuming it's an original name)
 */
export function maskChatName(name: string): string {
  if (!name) return name;

  // If it looks like a phone number, mask it
  if (isPhoneNumber(name)) {
    return maskPhoneNumber(name);
  }

  // If it looks like a username/nickname, mask it
  if (isUsername(name)) {
    return maskUsername(name);
  }

  // Otherwise, return as is (original name)
  return name;
}