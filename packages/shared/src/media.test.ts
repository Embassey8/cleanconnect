import { describe, expect, it } from "vitest";
import { fitWithin, isCleanJpeg, stampText } from "./media";

const seg = (marker: number, len: number) => [0xff, marker, (len + 2) >> 8, (len + 2) & 0xff, ...new Array(len).fill(0)];
const jpeg = (...segments: number[][]) => new Uint8Array([0xff, 0xd8, ...segments.flat(), 0xff, 0xda, 0, 2, 0, 0xff, 0xd9]);

describe("stamp", () => {
  it("names the month and year", () => expect(stampText(new Date("2026-10-29T12:00:00Z"))).toBe("Taken on CleanConnect · October 2026"));
});

describe("isCleanJpeg", () => {
  it("accepts a JPEG with no metadata segments", () => {
    expect(isCleanJpeg(jpeg(seg(0xdb, 4), seg(0xc0, 6)))).toBe(true);
  });
  it("rejects EXIF/XMP (APP1) metadata", () => {
    expect(isCleanJpeg(jpeg(seg(0xe1, 10), seg(0xdb, 4)))).toBe(false);
  });
  it("rejects non-JPEG bytes", () => {
    expect(isCleanJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(isCleanJpeg(new Uint8Array([]))).toBe(false);
  });
});

describe("fitWithin", () => {
  it("scales down to the longest edge", () => expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 }));
  it("never upscales", () => expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 }));
});
