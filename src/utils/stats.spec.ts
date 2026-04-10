import { median, average, countAtOrBelow } from './stats';

describe('stats utilities', () => {

  describe('median', () => {
    it('should return null for empty array', () => {
      expect(median([])).toBeNull();
    });

    it('should return the single value', () => {
      expect(median([ 5 ])).toBe(5);
    });

    it('should return middle value for odd-length array', () => {
      expect(median([ 3, 1, 2 ])).toBe(2);
    });

    it('should return average of two middle values for even-length array', () => {
      expect(median([ 1, 4, 3, 2 ])).toBe(2.5);
    });

    it('should handle already-sorted input', () => {
      expect(median([ 10, 20, 30, 40, 50 ])).toBe(30);
    });

    it('should not mutate the input array', () => {
      const input = [ 3, 1, 2 ];
      median(input);
      expect(input).toEqual([ 3, 1, 2 ]);
    });
  });

  describe('average', () => {
    it('should return null for empty array', () => {
      expect(average([])).toBeNull();
    });

    it('should return the single value', () => {
      expect(average([ 7 ])).toBe(7);
    });

    it('should compute arithmetic mean', () => {
      expect(average([ 10, 20, 30 ])).toBe(20);
    });

    it('should handle non-integer results', () => {
      expect(average([ 1, 2 ])).toBe(1.5);
    });
  });

  describe('countAtOrBelow', () => {
    it('should return 0 for empty array', () => {
      expect(countAtOrBelow([], 10)).toBe(0);
    });

    it('should count all values at or below threshold', () => {
      expect(countAtOrBelow([ 1, 2, 3, 4, 5 ], 3)).toBe(3);
    });

    it('should return full length when all values are at or below', () => {
      expect(countAtOrBelow([ 1, 2, 3 ], 100)).toBe(3);
    });

    it('should return 0 when no values are at or below', () => {
      expect(countAtOrBelow([ 10, 20, 30 ], 5)).toBe(0);
    });

    it('should include exact threshold values', () => {
      expect(countAtOrBelow([ 1, 5, 5, 10 ], 5)).toBe(3);
    });
  });

});
