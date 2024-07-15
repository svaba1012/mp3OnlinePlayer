const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const nodeID3 = require("node-id3");
const multipart = require("connect-multiparty");
const fs = require("fs");
const getMP3Duration = require("get-mp3-duration");
const dotenv = require("dotenv");
const _ = require("lodash");

const multipartMiddleware = multipart({
  uploadDir: "./songs",
});

dotenv.config();

const app = express();

let currentSong = null;
let currentPlaylist = null;

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
// app.use(express.static("public"));
app.use(express.static(__dirname + "/public"));

mongoose.connect(process.env.DB_URL);

const artistSchema = mongoose.Schema({
  name: String,
});

const genreSchema = mongoose.Schema({
  name: String,
});

const songSchema = mongoose.Schema({
  title: String,
  kebabTitle: String,
  path: String,
  artist: artistSchema,
  genre: genreSchema,
  lenght: Number,
});

const playListSchema = mongoose.Schema({
  songs: [songSchema],
});

const Song = mongoose.model("Song", songSchema);
const Artist = mongoose.model("Artist", artistSchema);
const Genre = mongoose.model("Genre", genreSchema);
const PlayList = mongoose.model("Playlist", playListSchema);

app.get("/", function (req, res) {
  res.render(__dirname + "/view/home.ejs");
});

let features = [
  {
    title: "Upload",
    description: "Upload mp3 songs, so you and others can listen later.",
    iconClass: "fa-solid fa-upload",
  },
  {
    title: "Search",
    description: "Search uploaded songs by name, author or duration.",
    iconClass: "fa-solid fa-magnifying-glass",
  },
  {
    title: "Play",
    description: "Play songs uploaded by you and others.",
    iconClass: "fa-solid fa-headphones",
  },
  {
    title: "Download",
    description: "Download songs uploaded by others.",
    iconClass: "fa-solid fa-download",
  },
];

app.get("/features", function (req, res) {
  res.render(__dirname + "/view/features.ejs", { features: features });
});

app.get("/upload", function (req, res) {
  Artist.find(function (err, artists) {
    Genre.find(function (err, genres) {
      res.render(__dirname + "/view/upload.ejs", {
        artists: artists,
        genres: genres,
      });
    });
  });
});

app.get("/search", function (req, res) {
  Artist.find(function (err, artists) {
    Genre.find(function (err, genres) {
      res.render(__dirname + "/view/search.ejs", {
        artists: artists,
        genres: genres,
      });
    });
  });
});

app.post("/results", function (req, res) {
  switch (req.body.type) {
    case "1":
      Song.find({ title: { $regex: req.body.input1 } }, function (err, songs) {
        let curPlaylist = new PlayList({ songs: songs });
        PlayList.deleteMany({}, function (err) {
          curPlaylist.save();
          res.render(__dirname + "/view/results.ejs", { songs: songs });
        });
      });
      break;

    case "2":
      Artist.findOne({ name: req.body.input2 }, function (err, artist) {
        Song.find({ artist: artist }, function (err, songs) {
          let curPlaylist = new PlayList({ songs: songs });
          PlayList.deleteMany({}, function (err) {
            curPlaylist.save();
            res.render(__dirname + "/view/results.ejs", { songs: songs });
          });
        });
      });
      break;

    case "3":
      console.log(req.body);
      Genre.find({ name: req.body.input3 }, function (err, genres) {
        Song.find({ genre: genres[0] }, function (err, songs) {
          console.log(songs);
          let curPlaylist = new PlayList({ songs: songs });
          PlayList.deleteMany({}, function (err) {
            curPlaylist.save();
            res.render(__dirname + "/view/results.ejs", { songs: songs });
          });
        });
      });
      break;
    case "4":
      let minDuration = req.body.input4min * 60000;
      let maxDuration = req.body.input4max * 60000;
      Song.find(
        {
          lenght: { $gte: minDuration, $lte: maxDuration },
        },
        function (err, songs) {
          let curPlaylist = new PlayList({ songs: songs });
          PlayList.deleteMany({}, function (err) {
            curPlaylist.save();
            res.render(__dirname + "/view/results.ejs", { songs: songs });
          });
        }
      );
      break;

      break;
    default:
      break;
  }
});

app.post("/upload", multipartMiddleware, async function (req, res) {
  Artist.find({ name: req.body.artist }, function (err, artists) {
    let artistId;
    let artist;

    if (artists.length == 0) {
      let newArtist = new Artist({ name: req.body.artist });
      artist = newArtist;
      newArtist.save();
    } else {
      artist = artists[0];
    }

    Genre.find({ name: req.body.genre }, function (err, genres) {
      let genreId;
      let genre;
      if (genres.length == 0) {
        let newGenre = new Genre({ name: req.body.genre });
        genre = newGenre;

        newGenre.save(function (err, genre) {
          let buffer = fs.readFileSync(req.files.songFile.path);
          let duration = getMP3Duration(buffer);

          let uploadedSong = new Song({
            title: req.body.title,
            kebabTitle: _.kebabCase(req.body.title),
            path: req.files.songFile.path,
            artist: artist,
            genre: genre,
            lenght: duration,
          });
          uploadedSong.save();
          res.redirect("/upload");
        });
      } else {
        genre = genres[0];
        let buffer = fs.readFileSync(req.files.songFile.path);
        let duration = getMP3Duration(buffer);

        let uploadedSong = new Song({
          title: req.body.title,
          kebabTitle: _.kebabCase(req.body.title),
          path: req.files.songFile.path,
          artist: artist,
          genre: genre,
          lenght: duration,
        });
        uploadedSong.save();
        res.redirect("/upload");
      }
    });
  });

  // fs.open(req.files.songFile.path, "r", function (err, file) {
  //   if (err) throw err;
  //   let tags = nodeID3.read(file);
  //   console.log(tags);
  // });
  // don't forget to delete all req.files when done
});

app.post("/download", function (req, res) {
  res.download(req.body.path);
});

app.get("/songs/:songName/:idx", function (req, res) {
  let processedSongName = req.params.songName;
  let index = req.params.idx;
  Song.findOne({ kebabTitle: processedSongName }, function (err, song) {
    currentSong = song;
    res.render(__dirname + "/view/song.ejs", { song: song, idx: index });
  });
});

app.post("/next", function (req, res) {
  PlayList.find({}, function (err, playlists) {
    let playlist = playlists[0];

    let idx = Number(req.body.curIdxNext) + 1;
    if (idx >= playlist.songs.length) {
      idx = 0;
    }
    res.redirect("/songs/" + playlist.songs[idx].kebabTitle + "/" + idx);
  });
});

app.post("/prev", function (req, res) {
  PlayList.find({}, function (err, playlists) {
    let playlist = playlists[0];
    let idx = req.body.curIdxPrev;
    if (idx <= 0) {
      idx = playlist.songs.length;
    }
    idx--;

    res.redirect("/songs/" + playlist.songs[idx].kebabTitle + "/" + idx);
  });
});

app.get("/audio/:songName", function (req, res) {
  let processedSongName = req.params.songName;
  Song.findOne({ kebabTitle: processedSongName }, function (err, song) {
    const range = req.headers.range || "0";
    currentSong = song;
    const videoPath = "./" + currentSong.path;
    const videoSize = fs.statSync(videoPath).size;
    const chunkSize = 1 * 1e6; //  1MB
    const start = Number(range.replace(/\D/g, ""));
    const end = Math.min(start + chunkSize, videoSize - 1);

    const contentLength = end - start + 1;

    const headers = {
      "Content-Range": `bytes ${start}-${end}/${videoSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": contentLength,
      "Content-Type": "audio/mpeg",
    };
    res.writeHead(206, headers);

    const stream = fs.createReadStream(videoPath, { start, end });
    stream.pipe(res);
  });
});

app.listen(3000, function () {
  console.log("Server started on port 3000");
});
