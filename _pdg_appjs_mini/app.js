const { exec } = require("child_process");

app.get("/run", (req, res) => {

    let input = req.query.host;
    exec("ping " + input);

});