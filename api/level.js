export default async function handler(req, res) {
  const levelId = req.query?.id;

  if (!levelId || !/^\d+$/.test(String(levelId))) {
    return res.status(400).json({ error: "A numeric level ID is required." });
  }

  const params = new URLSearchParams({
    secret: "Wmfd2893gb7",
    gameVersion: "22",
    binaryVersion: "47",
    levelID: String(levelId)
  });

  try {
    const response = await fetch(
      "https://www.boomlings.com/database/downloadGJLevel22.php",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0"
        },
        body: params.toString()
      }
    );

    const text = await response.text();

    if (!response.ok) {
      return res.status(502).json({
        error: "Geometry Dash server returned an error.",
        upstreamStatus: response.status,
        upstreamResponse: text
      });
    }

    return res.status(200).json({
      levelId: String(levelId),
      raw: text
    });
  } catch (error) {
    return res.status(502).json({
      error: "Could not contact the Geometry Dash server.",
      details: error.message
    });
  }
}
