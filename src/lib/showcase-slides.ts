// The product screenshot reel, shared by the landing FeatureShowcase and the
// auth pages' AuthShowcase (DataFast/Postiz-style signup: form left, product
// proof right). One list so a new screenshot shows up everywhere.

export type Slide = {
  id: string;
  title: string;
  caption: string;
  image: string;
  alt: string;
  /** Landing reel only: fit the whole shot inside the stage instead of
   *  filling it. For screenshots taller than the stage's 3020/1370, the
   *  default cover crop eats the app's top bar - dark bars at the sides
   *  read as nothing on a black stage, a sliced top bar reads as broken. */
  fit?: "contain";
};

// Real screenshots of ClockedCode, the owner's own site on the autopilot
// (captured 2026-11-08). Results first, because that is what a visitor came
// for: the traffic, then the articles bringing it, then what an article looks
// like, then how topics are picked. Every re-shoot gets a NEW filename: the
// browser and next/image cache an image by its URL, so overwriting a file in
// place keeps serving the old picture.
// Framing rule (v5): every shot fills the window edge to edge - cards are
// cropped just inside their own border, the queue and the article keep a
// thin margin of their own page - at exactly the stage's 3020x1370 shape,
// captured at 3x and scaled down so the text stays sharp. The traffic card
// drops the publishing calendar and shortens the main chart to fit; the
// article's cover is cropped to a wide band. Keep the window at 3020/1370.
// The article shot is the live page as it is (painted FLUX.2 klein cover,
// deployed to clockedcode.com 2026-11-08; date + read time kept), minus the
// tag pills, the description and ClockedCode's own upsell box.
export const SLIDES: Slide[] = [
  {
    id: "traffic",
    title: "Watch Google send you visitors",
    caption: "Your visitors and impressions from Google, day by day.",
    image: "/screenshots/landing-traffic-v5.png",
    alt: "Overview charts for one site: 414 people from Google in 30 days (up 26%) and 59,316 impressions on Google",
  },
  {
    id: "top-posts",
    title: "See which articles bring people in",
    caption: "Clicks, impressions and your spot on Google, per article.",
    image: "/screenshots/landing-top-posts-v5.png",
    alt: "The top posts list: each article with its position on Google, impressions and clicks over the last 30 days",
  },
  {
    id: "article",
    title: "Real articles, live on your site",
    caption: "Written for your site and published for you.",
    image: "/screenshots/landing-article-v8.png",
    alt: "A published article on clockedcode.com, 'Claude Code Stuck on Compacting? How to Fix It', with its illustrated cover and its on-this-page contents",
  },
  {
    id: "queue",
    title: "Topics people actually search for",
    caption: "Every topic comes with its monthly searches and difficulty.",
    image: "/screenshots/landing-queue-v6.png",
    alt: "The queue of upcoming articles, each with its keyword, monthly searches, difficulty score and the day it will be written",
  },
];
