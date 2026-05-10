const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");
const puppeteer = require("puppeteer");
const app = express();

app.use(cors());

app.use(express.static(
    path.join(__dirname, "public")
));



async function getBrowserHeaders(url){

    const browser =
      await puppeteer.launch({
          headless: true
      });

    const page =
      await browser.newPage();

    await page.goto(url, {
        waitUntil: "networkidle2"
    });

    const cookies =
      await page.cookies();

    const cookieHeader =
      cookies
        .map(c => `${c.name}=${c.value}`)
        .join("; ");

    const userAgent =
      await page.evaluate(
        () => navigator.userAgent
      );

    await browser.close();

    return {
        "User-Agent": userAgent,
        "Cookie": cookieHeader
    };
}

app.get("/watch", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "watch.html"
        )
    );
});

function getHeaders(targetUrl){

    let origin = "";
    let referer = "";

    try{

        const parsed =
          new URL(targetUrl);

        origin =
          parsed.origin;

        referer =
          parsed.origin + "/";

    } catch(e){}

    return {
        "User-Agent":
            "Mozilla/5.0",
        "Origin":
            origin,
        "Referer":
            referer
    };
}

app.get("/proxy", async (req, res) => {

    try {

        const target =
          req.query.url;

        if(!target){

            return res
              .status(400)
              .send("Missing url");
        }

        const browserHeaders =
  await getBrowserHeaders(target);

        const response =
          await axios.get(target, {
              responseType: "text",
              headers: {
                  ...browserHeaders,

                  "Accept":
                    "*/*",

                  "Cache-Control":
                    "no-cache",

                  "Pragma":
                    "no-cache"
              }
          });

        let playlist =
          response.data;

        const baseUrl =
          target.substring(
              0,
              target.lastIndexOf("/") + 1
          );

        playlist = playlist
            .split("\n")
            .map(line => {

                if(
                    line.startsWith("#")
                ){

                    if(
                        line.includes('URI="')
                    ){

                        return line.replace(
                            /URI="([^"]+)"/,
                            (match, p1) => {

                                let full;

                                if(
                                    p1.startsWith("http")
                                ){

                                    full = p1;

                                } else {

                                    full =
                                      baseUrl + p1;
                                }

                                return `URI="/file?url=${encodeURIComponent(full)}"`;
                            }
                        );
                    }

                    return line;
                }

                if(
                    line.trim() === ""
                ){
                    return line;
                }

                let fullUrl;

                if(
                    line.startsWith("http")
                ){

                    fullUrl = line;

                } else {

                    fullUrl =
                      baseUrl + line;
                }

                return `/file?url=${encodeURIComponent(fullUrl)}`;

            })
            .join("\n");

        res.setHeader(
            "Content-Type",
            "application/vnd.apple.mpegurl"
        );

        res.send(playlist);

    } catch(err){

        console.error(err.message);

        res.status(500)
           .send("Playlist failed");
    }
});

app.get("/file", async (req, res) => {

    try {

        const target =
          req.query.url;

        if(!target){

            return res
              .status(400)
              .send("Missing URL");
        }

        const headers = {
            "User-Agent":
              req.headers["user-agent"] ||
              "Mozilla/5.0",

            "Referer":
              new URL(target).origin + "/",

            "Origin":
              new URL(target).origin,

            "Accept":
              "*/*",

            "Accept-Language":
              "en-US,en;q=0.9",

            "Cache-Control":
              "no-cache",

            "Pragma":
              "no-cache",

            "Connection":
              "keep-alive",

            "Sec-Fetch-Dest":
              "empty",

            "Sec-Fetch-Mode":
              "cors",

            "Sec-Fetch-Site":
              "cross-site"
        };

        if(req.headers.cookie){

            headers["Cookie"] =
              req.headers.cookie;
        }

        const response =
          await axios({
              method: "GET",
              url: target,
              responseType: "stream",
              headers
          });

        res.setHeader(
            "Access-Control-Allow-Origin",
            "*"
        );

        if(response.headers["content-type"]){

            res.setHeader(
                "Content-Type",
                response.headers["content-type"]
            );
        }

        response.data.pipe(res);

    } catch(err){

        console.error(
          "FILE ERROR:",
          err.response?.status,
          err.message
        );

        res.status(500).send(
          "Protected stream blocked"
        );
    }
});

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(
      `Running on http://localhost:${PORT}`
    );
});