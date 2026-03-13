import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveXUser, type XUserInfo } from './twitter';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const MOCK_API_RESPONSE = {
  id: '123456789',
  userName: 'death_xyz',
  name: 'Death',
  profilePicture: 'https://pbs.twimg.com/photo.jpg',
  isBlueVerified: true,
  unavailable: false,
};

describe('resolveXUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns user info for a valid username', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_API_RESPONSE,
    });

    const result = await resolveXUser('death_xyz', 'test-api-key');
    expect(result).not.toBeNull();
    expect(result!.xUserId).toBe('123456789');
    expect(result!.username).toBe('death_xyz');
    expect(result!.isBlueVerified).toBe(true);
  });

  it('returns null when user is not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await resolveXUser('nonexistent_usr', 'test-api-key');
    expect(result).toBeNull();
  });

  it('returns null when user is unavailable', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...MOCK_API_RESPONSE, unavailable: true }),
    });

    const result = await resolveXUser('suspended_user', 'test-api-key');
    expect(result).toBeNull();
  });

  it('sanitizes username — strips @ prefix', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_API_RESPONSE,
    });

    await resolveXUser('@death_xyz', 'test-api-key');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('userName=death_xyz'),
      expect.anything(),
    );
  });

  it('throws on invalid username format', async () => {
    await expect(resolveXUser('inv@lid!', 'test-api-key')).rejects.toThrow('Invalid username');
  });
});
