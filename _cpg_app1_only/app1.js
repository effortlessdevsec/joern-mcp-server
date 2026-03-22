const { exec } = require("child_process");

app.get("/run", (req, res) => {
    let input = req.query.host;

    if (input) {
        // Vulnerable: only blacklisting some dangerous characters
        const blacklist = /[;&|$<>]/; // blocks only a few characters
        if (blacklist.test(input)) {
            res.status(400).send("Invalid characters in host.");
        } else {
            // STILL VULNERABLE: attacker can use other tricks to inject commands
            exec("ping " + input, (err, stdout, stderr) => {
                if (err) {
                    res.status(500).send("Error executing ping.");
                    return;
                }
                res.send(`<pre>${stdout}</pre>`);
            });
        }
    } else {
        res.send("No host provided.");
    }
});