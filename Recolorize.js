//Importing useful packages
import express from "express";
import bodyParser from "body-parser";
import session from 'express-session';
import flash from 'express-flash';
import pg from "pg";
import sharp from "sharp";
import multer from "multer";
import AdmZip from "adm-zip";
import bcrypt from "bcrypt";

const saltRounds = 10;

//Configuring .env
import dotenv from "dotenv";
dotenv.config();

//Setting up the server
const app = express();
const port = 3000;

//Setting up multer for file uploading
const upload = multer({ dest: "uploads/" });

//express-session set-up
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

//For displaying flash messages
app.use(flash());

//creating a db object to facilitate communication between the server and the database
const db = new pg.Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT)
})
db.connect();//connecting to the database

app.use(express.static("public"));//For using css (serving static files)
//Defining the body-parser which will be used in reading user input
app.use(bodyParser.urlencoded({ extended: true }));


//Displaying the Login Page
app.get("/", (req, res) => {
    res.render("login.ejs", { msg: req.flash('msg') });
});

//Importing luxon library for working with dates/time
import { DateTime } from "luxon";

//Displaying the Registration page 
app.get("/register", (req, res) => {
    res.render("registration.ejs", { msg: null });
});

//Displaying the Home Page
app.get("/home", (req, res) => {
    res.render("home.ejs", { msg: req.flash('msg') });
});

//Displaying the Recolorization page
app.get("/recolorization", (req, res) => {
    res.render("recolorization.ejs", { msg: null });
});

//Displaying the Color Gallery page and sending the result object to it(contatining data from the 
// recolored_images table)
app.get("/color-gallery", async (req, res) => {

  //Retrieving image data from the database
  const result = await db.query(
    "SELECT id, filename, created_at, color, image FROM recolored_images ORDER BY created_at DESC"
  );

  //Variable for grouping images by color
  const colorGroups = {};
  result.rows.forEach(file => {
  // Converting the binary buffer stored in the database to be used in <img> elements
  const base64 = Buffer.from(file.image).toString('base64');
  file.dataUrl = `data:image/png;base64,${base64}`;//'data:image/png;base64,${base64}, represents 
  // a PNG image

  //Formatting the created_at date using luxon npm package
  const createdAt = DateTime.fromJSDate(file.created_at, { zone: "utc" })
                            .setZone("Europe/Istanbul")
                            .toFormat("yyyy-MM-dd HH:mm:ss");
  file.formattedDate = createdAt; //Storing the date to the database

  // Grouping images based on their hexadecimal code (for example, #00ffff #ff0000 etc.) 
  const key = (file.color || '').toString().trim() || 'Unknown';
  //If a color group doesnt exist, create it
  if (!colorGroups[key]) colorGroups[key] = [];
  //If a color group exists, push the group file into it
  colorGroups[key].push(file);
});
  //rendering the color-gallery and sending the colorGroup data to it to be used in .ejs
  res.render("color-gallery.ejs", { colorGroups, msg: req.flash("msg") });
});

// Download endpoint
app.get("/download/:id", async (req, res) => {
    //storing the id 
    const id = req.params.id;

    //querying the database to find images with that id
    const result = await db.query("SELECT filename, image FROM recolored_images WHERE id = $1", [id]);

    //If no image was found, display an error message and reload the color gallery page so that the 
    // user can retry downloading an image
    if (result.rows.length === 0) {
        req.flash('msg', 'File not found');
        return res.redirect('/color-gallery');
    }

    //Downloading the image
    const file = result.rows[0];
    //Tells the browser to download the file and use its original filename.
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    // Specifies the data as binary (application/octet-stream)
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(file.image);//trigerring the download    
});

// Registration
app.post("/submit", async (req, res) => {
    //Storing User input into variables using req.body method from the body-parser package
    const username = req.body.username;
    const pwd = req.body.password;
    const confirm_pwd = req.body.confirmation_password;

    //Retrieving username data from the database which will be returned as an object named result
    //Then map the username row of the result object into the usernames array(mapping means that 
    //every value within the result's username rows will be stored in the usernames array)
    //So in short, we store every username in the database to the usernames array
    const result = await db.query("SELECT username FROM users");
    const usernames = result.rows.map(row => row.username);


  //If any errors occur during the constraint checking process, display an error message and reload the
  //registration page so that the user can try again

  //If not, display a success message and redirect the user to the login page so they can login and access the
  //rest of the application

    //Checking if the username already exists in the database
    if (usernames.includes(username)) {
        return res.render("registration.ejs", { msg: "This username is already taken!" });
    }

    //Checking if the user left any of the fields empty
    if (!username?.trim() || !pwd?.trim() || !confirm_pwd?.trim()) {
        return res.render("registration.ejs", { msg: "Please fill in all required fields!" });
    }


    //Checking if the password constains at least 10 characters
    if (pwd.length < 10) {
        return res.render("registration.ejs", { msg: "Your password is too short! It should be at least 10 characters long" });
    }

    //Checking if the password and confirmation password are equal to each other if not
    //the user did not successfuly confirmed their password, print an error message
    if (pwd !== confirm_pwd) {
        return res.render("registration.ejs", { msg: "Password and Confirmation password do not match up! Please Try again!" });
    }

    //Regex checking if the password contains any numbers
    if (!/[0-9]/.test(pwd)) {
        return res.render("registration.ejs", { msg: "Invalid Password! Your password should contain at least 1 number" });
    }

    //Regex checking if the password contains any uppercase letters
    if (!/[A-Z]/.test(pwd)) {
        return res.render("registration.ejs", { msg: "Invalid Password! Your password should contain at least 1 uppercase letter" });
    }

    //Regex checking if the password contains any lowercase letters
    if (!/[a-z]/.test(pwd)) {
        return res.render("registration.ejs", { msg: "Invalid Password! Your password should contain at least 1 lowercase letter" });
    }

    //Regex checking if the password contains any special characters
    if (!/[!#<$%&|*+_/?~.;:'^@€₺]/.test(pwd)) {
        return res.render("registration.ejs", { msg: "Invalid Password! Your password should contain at least 1 special character" });
    }

    //If the registration operation was successful, save registration credentials (passwords are hashed) of the user to the database
    //display a success message and redirect the user to the login page so that they can access the rest of the
    //application
    const hashedPassword = await bcrypt.hash(pwd, saltRounds);
    await db.query(
      "INSERT INTO users(username,password) VALUES ($1,$2)",
      [username, hashedPassword]
    );
    req.flash('msg', 'Registration Successful');
    res.redirect('/');
});

// Login
app.post("/login", async (req, res) => {
    const login_username = req.body.username;
    const login_pwd = req.body.password;

    // Find user by username only
    const result = await db.query(
        "SELECT * FROM users WHERE username=$1",
        [login_username]
    );

    // If username does not exist
    if (result.rows.length === 0) {
        return res.render("login.ejs", { msg: "Invalid Username or Password!" });
    }

    const user = result.rows[0];

    // Compare typed password with hashed password stored in database
    const passwordMatches = await bcrypt.compare(login_pwd, user.password);

    if (!passwordMatches) {
        return res.render("login.ejs", { msg: "Invalid Username or Password!" });
    }

    req.flash('msg', `Login Successful! Welcome, ${login_username}!`);
    res.redirect('/home');
});

//Recolorization
app.post("/recolor", upload.single("myfile"), async (req, res) => {/*upload is a middleware from the 
  multer package meaning that the route expects a file to be uploaded in our case a .zip file  */
  try {

    //To store the color picked by the user to a local variable
    const userColor = req.body.favcolor;

    //Hexadecimal Codes: ##rrggbb
    const rNew = parseInt(userColor.slice(1, 3), 16);//First 2 characters after # represent red
    const gNew = parseInt(userColor.slice(3, 5), 16);//Next 2 characters represent green
    const bNew = parseInt(userColor.slice(5, 7), 16);//Final 2 characters represent red

    //Creating a new variable storing the zip file uploaded by the user 
    //new AdmZip comes from the adm-zip package while req.file.path is the path of the uploaded 
    //zip file provided by the user.
    const zip = new AdmZip(req.file.path);

    //Storing all the data(files,folders etc.) into an array so that we can loop through and manipulate
    //all the data within the zip file
    const zipEntries = zip.getEntries();

    //Loop that checks the content within the zip file provided by the user
    for (const entry of zipEntries) {
      //The two if conditions below ensure that the application only reads image files and not anything
      //else to prevent errors

      //If there is a directory, skip it
      if (entry.isDirectory) continue;
      //If there is a file that is not an image file(png,jpg,jpeg), skip it
      if (!entry.entryName.match(/\.(png|jpg|jpeg)$/i)) continue;

      //Retrieves the actual data from the zip file
      const imgBuffer = entry.getData();
      //initalizing image processing 
      const image = sharp(imgBuffer);

      //retrieves image data(format,width,height etc.) using sharp library (.metadata()) 
      const metadata = await image.metadata();
      //Extracts color channels from the image data, in our case it is 3 since we are working with RGB images.
      const channels = metadata.channels;

      //Getting the raw pixel data
      //.raw(): sharp library method to output the image as raw, uncompressed pixel data to ma
      //.toBuffer({ resolveWithObject: true }) normally toBuffer only returns the buffer but by setting 
      //the resolveWithObject property to true, it returns an object that we can use to mainpulate the pixel
      //data of the image
      const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

      // Converting raw buffer data to an array to easily manipulate the pixels of the image
      const pixelData = new Uint8Array(data);

      // For loop that goes through the pixelData(every pixel in the image)
      //i increments by channels each time since in rgb the pixel data is as follows:
      //{R,G,B,R,G,B,R,G,B,R,G,B} etc.
      for (let i = 0; i < pixelData.length; i += channels) {
        //Reads the pixel data from the array and stores it in variables:
        //r: i , g: i+1 , b: i+2
        const r = pixelData[i], g = pixelData[i+1], b = pixelData[i+2];
        //r>150 denotes that the image is primarily red. If the image is greenish we can change the cond
        //ition to g>150 && r<120 && b<120 to denote that the image is primarily green
        if (r > 150 && g < 120 && b < 120) {
          //recoloring pixels based on the color inputted by the user
          pixelData[i] = rNew; 
          pixelData[i+1] = gNew;
          pixelData[i+2] = bNew;
        }
      }

      //Reconstructing the new recolored image as a png file using sharp library based 
      // on the modified pixel array(pixelData)
      const recoloredBuffer = await sharp(pixelData, {
        raw: { width: info.width, height: info.height, channels: channels }
      }).png().toBuffer();

      //Storing the image data, name, image data, creation time and color to the website.
      //The entry.entryName.replace() method replaces the file extensions with png
      //So any input from the user whether its .jpg,.jpeg,.png is converted to .png after the
      //recolorization process hsa been completed. 
      //Since the data i was provided consists solely of .png image files, implemented the application to produce
      //.png files
      await db.query(
        "INSERT INTO recolored_images (filename, image, created_at, color) VALUES ($1,$2,NOW(),$3)",
        [entry.entryName.replace(/\.[^/.]+$/, ".png"), recoloredBuffer, userColor]
      );
    }

    //If the recolorization process was successful, display a flash success message and redirect the
    //user to the Color Gallery Page so that the user can view the different colored images
    req.flash('msg', 'Images recolored and uploaded successfully!');
    res.redirect("/color-gallery");
  } 
  //If an error occured when processing the user upload, display an error message and reload the re
  //colorization page so that the user can retry again
  catch (err) {//To catch any errors
    console.error(err);
    req.flash('msg', 'Error processing ZIP file!');
    res.redirect("/recolorization");
  }
});

//To check whether the port is active or not(checking if the server is live or not)
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});