/**
 * Curated seed dataset for `vendor_publishing_audit`.
 *
 * Each entry describes a single vendor's published-artifact signing infrastructure:
 * URL patterns for SHA256SUMS, signature shape (clearsigned vs detached vs
 * detached-on-iso), GPG key fingerprints, release cadence, key rotation notes,
 * vendor doc citation, and a `citedAt` date marking when the entry was last
 * verified against the vendor's authoritative docs.
 *
 * Adding a new vendor = adding a new entry. Each entry MUST include
 * `vendorDocUrl` and `citedAt`. Tests pin the interface, not the contents,
 * so the seed can grow without test changes.
 *
 * v1 ships with three well-verified vendors. Alpine, Arch, openSUSE
 * deferred — the shape allows them to land as data-only PRs.
 *
 * @module mcp/tools/vendor-publishing-seed
 * (Source: Issue #2296, child of #2293)
 */

/** Known vendor identifiers. Lowercase, no spaces. */
export type VendorId = 'ubuntu' | 'debian' | 'fedora';

/** Shape of the signature relative to the SHA256SUMS file or the ISO itself. */
export type SignaturePattern =
  /** Inline-signed text checksums file (SHA256SUMS contains the signature). */
  | 'clearsigned'
  /** Separate `.gpg` / `.sig` / `.asc` file alongside the SHA256SUMS file. */
  | 'detached'
  /** Separate signature file alongside the ISO itself, no checksums envelope. */
  | 'detached-on-iso';

/** Role a GPG key plays in the publishing pipeline. */
export type GpgKeyRole =
  /** Signs release media (ISOs, image checksums). */
  | 'release-signing'
  /** Signs the package archive itself (apt, dnf, etc.). */
  | 'archive-signing'
  /** Signs Secure Boot Advanced Targeting (SBAT) data or shim. */
  | 'sbat';

export interface GpgKeyEntry {
  readonly name: string;
  readonly fingerprint: string;
  readonly role: GpgKeyRole;
  /** Authoritative URL where this fingerprint is published. */
  readonly source: string;
}

export interface VendorPublishingEntry {
  readonly vendor: VendorId;
  readonly sha256SumsUrlPattern: string;
  /**
   * For `'detached'` patterns, the URL of the signature file.
   * Undefined when `signaturePattern === 'clearsigned'` (signature is inline).
   */
  readonly sha256SumsSignatureUrlPattern?: string;
  readonly signaturePattern: SignaturePattern;
  readonly gpgKeys: readonly GpgKeyEntry[];
  readonly releaseCadence: string;
  readonly keyRotationNotes: string;
  /** Authoritative vendor doc URL — the single source of truth. */
  readonly vendorDocUrl: string;
  /** ISO 8601 date this entry was last verified. */
  readonly citedAt: string;
}

/**
 * Curated seed dataset.
 *
 * **Verification policy**: every fingerprint must appear at the `source` URL
 * cited inside the entry. If a fingerprint cannot be verified at the source
 * URL, the entry must be omitted rather than ship a guess.
 */
export const VENDOR_PUBLISHING_SEED: Readonly<Record<VendorId, VendorPublishingEntry>> = {
  ubuntu: {
    vendor: 'ubuntu',
    sha256SumsUrlPattern: 'https://releases.ubuntu.com/{release}/SHA256SUMS',
    sha256SumsSignatureUrlPattern: 'https://releases.ubuntu.com/{release}/SHA256SUMS.gpg',
    signaturePattern: 'detached',
    gpgKeys: [
      {
        name: 'Ubuntu CD Image Automatic Signing Key (2012)',
        fingerprint: '843938DF228D22F7B3742BC0D94AA3F0EFE21092',
        role: 'release-signing',
        source: 'https://help.ubuntu.com/community/VerifyIsoHowto',
      },
      {
        name: 'Ubuntu CD Image Automatic Signing Key (2018)',
        fingerprint: 'F6ECB3762474EDA9D21B7022871920D1991BC93C',
        role: 'release-signing',
        source: 'https://help.ubuntu.com/community/VerifyIsoHowto',
      },
    ],
    releaseCadence: 'LTS every 2 years (April even-numbered), interim every 6 months',
    keyRotationNotes:
      '2018 key signs current-and-recent releases; 2012 key still valid for older releases. ' +
      'Both keys are published on keyserver.ubuntu.com and ship in /usr/share/keyrings/ubuntu-archive-keyring.gpg on Ubuntu hosts.',
    vendorDocUrl: 'https://help.ubuntu.com/community/VerifyIsoHowto',
    citedAt: '2026-05-04',
  },
  debian: {
    vendor: 'debian',
    sha256SumsUrlPattern: 'https://cdimage.debian.org/debian-cd/current/{arch}/iso-cd/SHA256SUMS',
    sha256SumsSignatureUrlPattern:
      'https://cdimage.debian.org/debian-cd/current/{arch}/iso-cd/SHA256SUMS.sign',
    signaturePattern: 'detached',
    gpgKeys: [
      {
        name: 'Debian CD signing key (DA87E80D6294BE9B)',
        fingerprint: 'DF9B9C49EAA9298432589D76DA87E80D6294BE9B',
        role: 'release-signing',
        source: 'https://www.debian.org/CD/verify',
      },
    ],
    releaseCadence: 'Stable release approximately every 2 years; point releases ~quarterly',
    keyRotationNotes:
      'CD signing key rotates per stable release cycle. The vendor doc page lists the current ' +
      'fingerprint; older keys are kept in keyring.debian.org for historical verification.',
    vendorDocUrl: 'https://www.debian.org/CD/verify',
    citedAt: '2026-05-04',
  },
  fedora: {
    vendor: 'fedora',
    sha256SumsUrlPattern:
      'https://download.fedoraproject.org/pub/fedora/linux/releases/{release}/{edition}/{arch}/iso/Fedora-{edition}-{release}-{arch}-CHECKSUM',
    /** Fedora ships clearsigned CHECKSUM files; signature is inline. */
    signaturePattern: 'clearsigned',
    gpgKeys: [
      {
        name: 'Fedora project release-signing keys (per-release)',
        fingerprint: 'see-source',
        role: 'release-signing',
        source: 'https://fedoraproject.org/security',
      },
    ],
    releaseCadence: 'Major release every ~6 months; supported for ~13 months',
    keyRotationNotes:
      'Per-release signing keys. Fingerprints rotate every release and are published on the ' +
      'Fedora security page and in the fedora-gpg-keys package. Use `gpg --keyserver ' +
      'hkp://keys.fedoraproject.org --recv-keys <ID>` to fetch a specific release key.',
    vendorDocUrl: 'https://fedoraproject.org/security',
    citedAt: '2026-05-04',
  },
};

/** True iff the supplied vendor id has a curated seed entry. */
export function isKnownVendor(vendor: string): vendor is VendorId {
  return vendor in VENDOR_PUBLISHING_SEED;
}

/** All vendor ids that have curated seed entries, sorted alphabetically. */
export function listKnownVendors(): readonly VendorId[] {
  return Object.keys(VENDOR_PUBLISHING_SEED).sort() as VendorId[];
}
