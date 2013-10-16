document.addEventListener("DOMContentLoaded", function() {
"use strict";

var ELBOW_PRB = 0.7; // Probability of generating an elbow pipe when a straight pipe is valid
var ALIGNED_PRB = 0.35; // Probability that a pipe in the generated solution is guaranteed to be aligned

var sets; // Number of sets
var rows; // Number of rows per set
var columns; // Number of columns per row

var cellPipe; // 3D array where [i][j][k] is the type of pipe at row j, column k of set i
var connected; // 3D array whose values are true iff the corresponding pipe is connected to the start
var imgElem; // imgElem[i][j][k] is the Image element at set i, row j, column k
var chain; // 3D array where ([i][j][0], [i][j][1]) are the coordinates of the (j-1)th pipe in the chain of set i
var inProgress = []; // inProgress[i] === false iff set i is finished
var ready; // True iff the ready timer has expired

var startTime; // The date at which the puzzles were created
var countCompleted; // Counter for the number of sets completed so far
var timeStats = {}; // A hash table that maps from "sets,rows,columns" to the best/average times of that board

var imgMap = [ // Types of pipes
    "LR", // left-right
    "TB", // top-bottom
    "TR", // top-right
    "BR", // bottom-right
    "BL", // bottom-left
    "TL" // top-left
];

// rot[i] is what a pipe of type i becomes after rotation
var rot = [1, 0, 3, 4, 5, 2];

// left[i] === true iff a pipe of type i connects to the left
var left =  [true,  false, false, false, true,  true];
var right = [true,  false, true,  true,  false, false];
var up =    [false, true,  true,  false, false, true];
var down =  [false, true,  false, true,  true,  false];

var hasAudio = !!document.createElement("audio").canPlayType;
var MAX_AUDIO_CHANNELS;
var audioChannels;
// storiesinflight.com HTML5 Audio and JavaScript Control
if (hasAudio) {
    MAX_AUDIO_CHANNELS = 8;
    audioChannels = new Array(MAX_AUDIO_CHANNELS);
    for (var i = 0; i < MAX_AUDIO_CHANNELS; i++) {
        audioChannels[i] = [];
        audioChannels[i].channel = new Audio();
        audioChannels[i].endTime = -1;
    }
}
function playSound(s) {
    if (hasAudio && !document.getElementById("muteSound").checked && ready) {
        for (var i = 0; i < audioChannels.length; i++) {
            var theTime = new Date().getTime();
            if (audioChannels[i].endTime < theTime) {
                audioChannels[i].endTime = theTime + document.getElementById(s).duration * 1000;
                audioChannels[i].channel.src = document.getElementById(s).src;
                audioChannels[i].channel.load();
                audioChannels[i].channel.play();
                break;
            }
        }
    }
}

/** Returns true iff the given board dimensions are valid.  If there is invalid input, then an alert will be issued. */
function validDimensions(sets, rows, columns) {
    var errors = [];
    if (sets < 1)       errors.push("The number of sets must be at least 1.");
    if (rows < 2)       errors.push("The number of rows must be at least 2.");
    if (columns < 2)    errors.push("The number of columns must be at least 2.");

    if (errors.length) {
        window.alert(errors.join("\n"));
        return false;
    }
    return true;
}

function startGame() {
    ready = true;
    for (var i = 0; i < sets; i++)
        for (var j = 0; j < rows; j++)
            for (var k = 0; k < columns; k++)
                draw(imgElem[i][j][k]);
    startTime = new Date().getTime();
}

/** Create the puzzle. */
function initialize() {
    ready = false;
    countCompleted = 0;

    var divMessage = document.getElementById("message");
    while (divMessage.firstChild) divMessage.removeChild(divMessage.firstChild);

    sets = parseInt(document.getElementById("numSets").value, 10);
    rows = parseInt(document.getElementById("numRows").value, 10);
    columns = parseInt(document.getElementById("numColumns").value, 10);
    var countdown = parseFloat(document.getElementById("timer").value) * 1000;

    if (isNaN(sets) || isNaN(rows) || isNaN(columns) || isNaN(countdown)) {
        window.alert("Non-numerical input detected.");
        return;
    }
    if (!validDimensions(sets, rows, columns)) return;

    var divPipe = document.getElementById("pipeArea");
    while (divPipe.firstChild) divPipe.removeChild(divPipe.firstChild);

    cellPipe   = new Array(sets);
    connected  = new Array(sets);
    imgElem    = new Array(sets);
    chain      = new Array(sets);
    inProgress = new Array(sets);

    for (var i = 0; i < sets; i++) {
        var table = document.createElement("table");

        cellPipe[i] = new Array(rows);
        connected[i] = new Array(rows);
        imgElem[i] = new Array(rows);
        chain[i] = [];
        inProgress[i] = true;

        var row = new Array(rows);
        for (var j = 0; j < rows; j++)
            row[j] = table.insertRow(j);

        var imgStart = document.createElement("img");
        imgStart.src = "pipeStart.png";
        var firstCell = row[0].insertCell(0);
        firstCell.rowSpan = rows;
        firstCell.appendChild(imgStart);

        for (var j = 0; j < rows; j++) {
            cellPipe[i][j] = new Array(columns);
            connected[i][j] = new Array(columns);
            imgElem[i][j] = new Array(columns);

            var temp = j === 0 ? 1 : 0;
            for (var k = 0; k < columns; k++) {
                var imgPipe = document.createElement("img");
                imgPipe.src = "blank.png";
                imgPipe.set = i;
                imgPipe.row = j;
                imgPipe.col = k;
                imgElem[i][j][k] = imgPipe;

                var cell = row[j].insertCell(k + temp);
                cell.appendChild(imgPipe);
                cellPipe[i][j][k] = -1;
            }
        }

        var lastCell = row[0].insertCell(columns + 1);
        lastCell.rowSpan = rows;
        lastCell.style.verticalAlign = "bottom"; // wut
        var imgEnd = document.createElement("img");
        imgEnd.src = "pipeEnd.png";
        imgEnd.className = "unconnected";
        imgEnd.id = "end" + i;
        lastCell.appendChild(imgEnd);

        divPipe.appendChild(table);
        randomize(i);
    }

    window.setTimeout(startGame, countdown);
}

/** Redraw the given Image element according to its corresponding state in the game. */
function draw(img) {
    img.className = connected[img.set][img.row][img.col] ? "" : "unconnected";
    img.src = "pipe" + imgMap[cellPipe[img.set][img.row][img.col]] + ".png";
}

/** Create a random puzzle for set i. */
function randomize(i) {
    var direction = 0; // right, up, down = 0, 1, 2
    var j = 0, k = 0;
    while (k < columns - 1) {
        var aligned = Math.random() < ALIGNED_PRB;
        if (j === 0 && direction === 1 || j === rows - 1 && direction === 2) {
            // At the top or bottom row with a connected pipe below/above
            cellPipe[i][j][k] = aligned ? 4 - direction : randomPipe(true);
            direction = 0;
        } else {
            if (Math.random() > ELBOW_PRB) {
                cellPipe[i][j][k] = aligned ? Math.ceil(direction / 2) : randomPipe(false);
            } else {
                if (direction > 0) {
                    cellPipe[i][j][k] = aligned ? direction + 1 : randomPipe(true);
                    direction = 0;
                } else if (j === 0) {
                    cellPipe[i][j][k] = aligned ? 4 : randomPipe(true);
                    direction = 2;
                } else if (j === rows - 1) {
                    cellPipe[i][j][k] = aligned ? 5 : randomPipe(true);
                    direction = 1;
                } else if (Math.random() < skewPrb(j / (rows - 1))) {
                    cellPipe[i][j][k] = aligned ? 5 : randomPipe(true);
                    direction = 1;
                } else {
                    cellPipe[i][j][k] = aligned ? 4 : randomPipe(true);
                    direction = 2;
                }
            }
        }

        if (direction === 0)        k++;
        else if (direction === 1)   j--;
        else if (direction === 2)   j++;
    }

    if (j === rows - 1) {
        cellPipe[i][j][k] = Math.random() < ALIGNED_PRB ? 0 : randomPipe(false);
    } else {
        cellPipe[i][j][k] = Math.random () < ALIGNED_PRB ? 4 : randomPipe(true);
        for (var y = j + 1; y < rows - 1; y++) {
            cellPipe[i][y][k] = Math.random() < ALIGNED_PRB ? 1 : randomPipe(false);
        }
        cellPipe[i][rows - 1][k] = Math.random() < ALIGNED_PRB ? 2 : randomPipe(true);
    }

    for (var y = 0; y < rows; y++) {
        for (var x = 0; x < columns; x++) {
            if (cellPipe[i][y][x] === -1) {
                var elbow = Math.random() < ELBOW_PRB;
                cellPipe[i][y][x] = randomPipe(elbow);
            }
        }
    }

    checkConnections(i, 0, 0); // Make sure puzzle isn't solved before the player touches it
}

function skewPrb(x) {
    return Math.pow(x, 6 * rows / columns - 2);
}

/** Return a random type of pipe.  An elbow pipe will be returned iff elbow is true. */
function randomPipe(elbow) {
    if (elbow)
        return Math.floor(Math.random() * 4) + 2;
    return Math.floor(Math.random() * 2);
}

/** Rotate the pipe corresponding to the Image element e. */
function rotate(e) {
    var i = e.set,
        j = e.row,
        k = e.col;
    cellPipe[i][j][k] = rot[cellPipe[i][j][k]];
    checkConnections(i, j, k);
    playSound("sndRotate");
}

function checkConnections(i, j, k) {
    var x, y;
    if (connected[i][j][k]) {
        // (j, k) lies in the chain
        var position = [j, k];
        var lastElement;
        do {
            // (j, k) is in the chain, so a rotation at (j, k) would break
            // the chain around that point. Disconnect every pipe after it.
            lastElement = chain[i].pop();
            connected[i][lastElement[0]][lastElement[1]] = false;
            if (ready) draw(imgElem[i][lastElement[0]][lastElement[1]]);
        } while(position[0] !== lastElement[0] || position[1] !== lastElement[1]);
    }

    if (chain[i].length === 0) {
        // Nothing is connected
        if (j === 0 && k === 0 && left[cellPipe[i][0][0]]) {
            x = 0;
            y = 0;
            connected[i][0][0] = true;
            chain[i].push([0, 0]);
        }
    } else {
        // Check for more pipes in the chain starting at the last pipe that is
        // known to be in the chain
        var lastElement = chain[i][chain[i].length - 1];
        x = lastElement[1];
        y = lastElement[0];
    }

    if (x !== undefined) {
        // Check for pipes in the chain starting at (y, x)
        while (true) {
            if (ready) draw(imgElem[i][y][x]);
            var flag = true;
            if (left[cellPipe[i][y][x]] && x > 0 && right[cellPipe[i][y][x - 1]]
                    && !connected[i][y][x - 1]) {
                x--;
            } else if (right[cellPipe[i][y][x]] && x < columns - 1
                    && left[cellPipe[i][y][x + 1]] && !connected[i][y][x + 1]) {
                x++;
            } else if (up[cellPipe[i][y][x]] && y > 0
                    && down[cellPipe[i][y - 1][x]] && !connected[i][y - 1][x]) {
                y--;
            } else if (down[cellPipe[i][y][x]] && y < rows - 1
                    && up[cellPipe[i][y + 1][x]] && !connected[i][y + 1][x]) {
                y++;
            } else {
                flag = false;
            }

            if (flag) {
                connected[i][y][x] = true;
                chain[i].push([y, x]);
            } else {
                break;
            }
        }
    }
    if (ready) draw(imgElem[i][j][k]);

    if (connected[i][rows - 1][columns - 1]
            && right[cellPipe[i][rows - 1][columns - 1]]) {
        if (!ready) {
            // Game hasn't even started, so reconstruct puzzle
            randomize(i);
            return;
        }

        // Set is complete
        inProgress[i] = false;
        countCompleted++;
        playSound("sndComplete");

        // Light up the last image
        var imgEnd = document.getElementById("end" + i);
        imgEnd.className = "";

        if (countCompleted === sets) {
            // Display time elapsed
            var secElapsed = (new Date().getTime() - startTime) / 1000;
            var divMessage = document.getElementById("message");
            divMessage.appendChild(document.createTextNode(
                    "Hacked in " + secElapsed + " sec."));

            // Check highscore
            var boardKey = [sets, rows, columns].join(",");
            var data = timeStats[boardKey];
            if (data === undefined) {
                // First completion on this setting
                timeStats[boardKey] = {count: 1, best: secElapsed, total: secElapsed};
            } else {
                data.count++;
                data.total += secElapsed;
                divMessage.appendChild(document.createElement("br"));

                if (secElapsed < data.best) {
                    // Old record beaten
                    divMessage.appendChild(document.createTextNode("New best time! Old best: " + data.best));
                    data.best = secElapsed;
                } else {
                    divMessage.appendChild(document.createTextNode("Best time: " + data.best));
                }
                divMessage.appendChild(document.createTextNode(" sec."));
            }

            showStats();
        }
    }
}

function getAverage(data) {
    return (data.total / data.count).toFixed(3);
}

function showStats() {
    var boardKey = [
            document.getElementById("numSets").value,
            document.getElementById("numRows").value,
            document.getElementById("numColumns").value
        ].join(",");
    var data = timeStats[boardKey];

    var tdBest = document.getElementById("statBest");
    var tdAvg = document.getElementById("statAvg");
    var tdCount = document.getElementById("statCount");

    if (data === undefined) {
        tdBest.replaceChild(document.createTextNode("\u2013"), tdBest.firstChild);
        tdAvg.replaceChild(document.createTextNode("\u2013"), tdAvg.firstChild);
        tdCount.replaceChild(document.createTextNode("0"), tdCount.firstChild);
    } else {
        tdBest.replaceChild(document.createTextNode(data.best + " sec"), tdBest.firstChild);
        tdAvg.replaceChild(document.createTextNode(getAverage(data) + " sec"), tdAvg.firstChild);
        tdCount.replaceChild(document.createTextNode(data.count), tdCount.firstChild);
    }
}

// Preload the images of the pipes
var imageNames = ["pipeStart", "pipeEnd"];
for (var i = 0; i < imgMap.length; i++)
    imageNames.push("pipe" + imgMap[i]);

var container = document.getElementById("preload");
for (var i = 0; i < imageNames.length; i++) {
    var img = document.createElement("img");
    img.src = imageNames[i] + ".png";
    container.appendChild(img);
}

document.getElementById("pipeArea").addEventListener("click", function(evt) {
    if (ready && inProgress[evt.target.set]) {
        rotate(evt.target);
        evt.stopPropagation();
    }
});

showStats();

document.getElementById("initialize").addEventListener("click", initialize);

/** Update the settings fields according to what the user selected in the pulldown menu. */
document.getElementById("level").addEventListener("change", function(evt) {
    var select = evt.currentTarget;
    var optionValue = select.options[select.selectedIndex].value;
    var notCustom = optionValue !== "custom";

    if (notCustom) {
        var values = optionValue.split(",");
        document.getElementById("numSets").value = parseInt(values[0], 10);
        document.getElementById("numRows").value = parseInt(values[1], 10);
        document.getElementById("numColumns").value = parseInt(values[2], 10);
    }
    document.getElementById("numSets").disabled = notCustom;
    document.getElementById("numRows").disabled = notCustom;
    document.getElementById("numColumns").disabled = notCustom;
});

document.body.addEventListener("change", function(evt) {
    if (/^(INPUT|SELECT)$/.test(evt.target.tagName)) {
        showStats();
    }
});

});