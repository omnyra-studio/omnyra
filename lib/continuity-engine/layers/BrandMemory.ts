export type BrandMemory = {
  niche:       string;
  characters:  unknown[];
  globalStyle: {
    fps:        number;
    lighting:   string;
    colorGrade: string;
    aspectRatio: "9:16" | "16:9";
  };
};
