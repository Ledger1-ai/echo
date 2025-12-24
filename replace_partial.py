from pathlib import Path

path = Path(r"i:/Osiris/varuni-demo/chicken-bones/src/app/console/page.tsx")
text = path.read_text()
start = text.index('type BoneState = {')
end = text.index('function EarIcon', start)
new_code = r"""type BoneState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  length: number;
  thickness: number;
  radius: number;
};

type BowlVariant = \"red\" | \"blue\";

const BOWL_VARIANTS: Record<
  BowlVariant,
  { accent: string; back: string; front: string }
> = {
  red: {
    accent: \"#4dd9cf\",\n"""
