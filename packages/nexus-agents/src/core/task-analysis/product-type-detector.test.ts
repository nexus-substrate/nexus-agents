/**
 * Tests for product-type-detector.ts
 *
 * Covers keyword-based product type detection across the 8-type taxonomy.
 */

import { describe, it, expect } from 'vitest';
import { detectProductType } from './product-type-detector.js';

// ============================================================================
// detectProductType
// ============================================================================

describe('detectProductType', () => {
  it('returns undefined for empty content', () => {
    const signals: string[] = [];
    expect(detectProductType('', signals)).toBeUndefined();
    expect(signals).toHaveLength(0);
  });

  it('returns undefined for content with no keyword matches', () => {
    const signals: string[] = [];
    expect(detectProductType('hello world', signals)).toBeUndefined();
  });

  it('detects api product type', () => {
    const signals: string[] = [];
    const result = detectProductType('Build a REST endpoint with graphql support', signals);
    expect(result).toBeDefined();
    expect(result?.type).toBe('api');
    expect(result?.confidence).toBeGreaterThan(0);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.some((s) => s.startsWith('productType:api:'))).toBe(true);
  });

  it('detects cli product type', () => {
    const signals: string[] = [];
    const result = detectProductType(
      'Create a CLI with argument parsing for the terminal',
      signals
    );
    expect(result?.type).toBe('cli');
  });

  it('detects frontend-web product type', () => {
    const signals: string[] = [];
    const result = detectProductType('Build a React SPA component in the browser', signals);
    expect(result?.type).toBe('frontend-web');
  });

  it('detects mobile product type', () => {
    const signals: string[] = [];
    const result = detectProductType(
      'Create a React Native mobile app for iOS and Android',
      signals
    );
    expect(result?.type).toBe('mobile');
  });

  it('detects data-pipeline product type', () => {
    const signals: string[] = [];
    const result = detectProductType('Build an ETL pipeline with Kafka streaming', signals);
    expect(result?.type).toBe('data-pipeline');
  });

  it('detects ml-service product type', () => {
    const signals: string[] = [];
    const result = detectProductType(
      'Deploy a PyTorch model for machine learning inference',
      signals
    );
    expect(result?.type).toBe('ml-service');
  });

  it('detects infra-module product type', () => {
    const signals: string[] = [];
    const result = detectProductType(
      'Write Terraform infrastructure for Kubernetes with Docker',
      signals
    );
    expect(result?.type).toBe('infra-module');
  });

  it('detects web-service product type', () => {
    const signals: string[] = [];
    const result = detectProductType(
      'Build a full-stack web service with backend server-side logic',
      signals
    );
    expect(result?.type).toBe('web-service');
  });

  it('is case-insensitive', () => {
    const signals: string[] = [];
    const result = detectProductType('BUILD A REST ENDPOINT', signals);
    expect(result).toBeDefined();
    expect(result?.type).toBe('api');
  });

  it('populates signals array with matched keywords', () => {
    const signals: string[] = [];
    detectProductType('REST endpoint with graphql', signals);
    expect(signals).toContain('productType:api:rest');
    expect(signals).toContain('productType:api:graphql');
  });

  it('returns confidence as ratio of best type matches to total', () => {
    const signals: string[] = [];
    // All matches are api keywords → confidence = 1.0
    const result = detectProductType('REST endpoint graphql', signals);
    expect(result?.confidence).toBe(1);
  });

  it('lowers confidence when multiple types match', () => {
    const signals: string[] = [];
    // "infrastructure" → infra-module, "rest" → api
    const result = detectProductType('Build rest infrastructure with kubernetes', signals);
    expect(result).toBeDefined();
    expect(result!.confidence).toBeLessThan(1);
  });

  it('picks type with highest match count when tied', () => {
    const signals: string[] = [];
    // 3 api keywords vs 1 infra keyword
    const result = detectProductType(
      'Build REST endpoint with graphql and api gateway on infrastructure',
      signals
    );
    expect(result?.type).toBe('api');
  });
});
