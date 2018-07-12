var aswh = aswh || {};
aswh.PRB_ELBOW = 0.5; // Probability of generating an elbow pipe when a straight pipe is valid
aswh.PRB_ALIGNED = 0.35; // Probability that a pipe in the generated solution is guaranteed to be aligned

document.addEventListener("DOMContentLoaded", function() {
"use strict";

var sets, // Number of sets
    rows, // Number of rows per set
    columns; // Number of columns per row

var cellPipe, // 3D array where [i][j][k] is the type of pipe at row j, column k of set i
    connected, // 3D array whose values are true iff the corresponding pipe is connected to the start
    pipeElems,
    chain, // 3D array where ([i][j][0], [i][j][1]) are the coordinates of the (j-1)th pipe in the chain of set i
    inProgress = []; // inProgress[i] === false iff set i is finished

var startTime, // The date at which the puzzles were created
    countCompleted, // Counter for the number of sets completed so far
    timeStats = {}; // A hash table that maps from "sets,rows,columns" to the best/average times of that board

var pipeMap = [ // Types of pipes
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
var left =  [true,  false, false, false, true,  true],
    right = [true,  false, true,  true,  false, false],
    up =    [false, true,  true,  false, false, true],
    down =  [false, true,  false, true,  true,  false];

var hasAudio = !!document.createElement("audio").canPlayType,
    MAX_AUDIO_CHANNELS,
    audioChannels;
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
    if (hasAudio && !document.getElementById("muteSound").checked) {
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
    document.getElementById("pipeArea").className = "";
    startTime = new Date().getTime();

    for (var i = 0; i < sets; i++) {
        inProgress[i] = true;
    }
}

/** Create the puzzle. */
function initialize() {
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
    divPipe.className = "setup";
    while (divPipe.firstChild) divPipe.removeChild(divPipe.firstChild);

    cellPipe   = new Array(sets);
    connected  = new Array(sets);
    pipeElems  = new Array(sets);
    chain      = new Array(sets);
    inProgress = new Array(sets);

    for (var i = 0; i < sets; i++) {
        var table = document.createElement("table");

        cellPipe[i] = new Array(rows);
        connected[i] = new Array(rows);
        pipeElems[i] = new Array(rows);
        chain[i] = [];
        inProgress[i] = false;

        var row = new Array(rows);
        for (var j = 0; j < rows; j++)
            row[j] = table.insertRow(j);

        var firstCell = row[0].insertCell(0);
        firstCell.rowSpan = rows;

        for (var j = 0; j < rows; j++) {
            cellPipe[i][j] = new Array(columns);
            connected[i][j] = new Array(columns);
            pipeElems[i][j] = new Array(columns);

            for (var k = 0; k < columns; k++) {
                var cell = row[j].insertCell(-1);
                cell.setAttribute("data-set", i);
                cell.setAttribute("data-row", j);
                cell.setAttribute("data-col", k);
                cell.className = 'unconnected';
                cell.oncontextmenu = function() { return false; } // Disable right-click

                pipeElems[i][j][k] = cell;
                cellPipe[i][j][k] = -1;
            }
        }

        var lastCell = row[0].insertCell(-1);
        lastCell.rowSpan = rows;
        lastCell.className = 'unconnected';

        divPipe.appendChild(table);
        randomize(i);
    }

    window.setTimeout(startGame, countdown);
}

/** Create a random puzzle for set i. */
function randomize(i) {
    var direction = 0; // (right, up, down) = (0, 1, 2)
    var j = 0, k = 0;
    while (k < columns - 1) {
        var aligned = Math.random() < aswh.PRB_ALIGNED;
        if (j === 0 && direction === 1 || j === rows - 1 && direction === 2) {
            // At the top or bottom row with a connected pipe below/above
            cellPipe[i][j][k] = aligned ? 4 - direction : randomPipe(true);
            direction = 0;
        } else {
            if (Math.random() > aswh.PRB_ELBOW) {
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

        pipeElems[i][j][k].setAttribute('data-type', pipeMap[cellPipe[i][j][k]]);

        if (direction === 0)        k++;
        else if (direction === 1)   j--;
        else if (direction === 2)   j++;
    }

    if (j === rows - 1) {
        cellPipe[i][j][k] = Math.random() < aswh.PRB_ALIGNED ? 0 : randomPipe(false);
        pipeElems[i][j][k].setAttribute('data-type', pipeMap[cellPipe[i][j][k]]);
    } else {
        cellPipe[i][j][k] = Math.random () < aswh.PRB_ALIGNED ? 4 : randomPipe(true);
        pipeElems[i][j][k].setAttribute('data-type', pipeMap[cellPipe[i][j][k]]);
        for (var y = j + 1; y < rows - 1; y++) {
            cellPipe[i][y][k] = Math.random() < aswh.PRB_ALIGNED ? 1 : randomPipe(false);
            pipeElems[i][y][k].setAttribute('data-type', pipeMap[cellPipe[i][y][k]]);
        }
        cellPipe[i][rows - 1][k] = Math.random() < aswh.PRB_ALIGNED ? 2 : randomPipe(true);
        pipeElems[i][rows - 1][k].setAttribute('data-type', pipeMap[cellPipe[i][rows - 1][k]]);
    }

    for (var y = 0; y < rows; y++) {
        for (var x = 0; x < columns; x++) {
            if (cellPipe[i][y][x] === -1) {
                cellPipe[i][y][x] = randomPipe(Math.random() < aswh.PRB_ELBOW);
                pipeElems[i][y][x].setAttribute('data-type', pipeMap[cellPipe[i][y][x]]);
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
    var i = parseInt(e.getAttribute("data-set"), 10),
        j = parseInt(e.getAttribute("data-row"), 10),
        k = parseInt(e.getAttribute("data-col"), 10);
    cellPipe[i][j][k] = rot[cellPipe[i][j][k]];
    e.setAttribute("data-type", pipeMap[cellPipe[i][j][k]]);
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
            pipeElems[i][lastElement[0]][lastElement[1]].className = 'unconnected';
        } while(position[0] !== lastElement[0] || position[1] !== lastElement[1]);
    }

    if (chain[i].length === 0) {
        // Nothing is connected
        if (j === 0 && k === 0 && left[cellPipe[i][0][0]]) {
            x = 0;
            y = 0;
            connected[i][0][0] = true;
            pipeElems[i][0][0].className = '';
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
                pipeElems[i][y][x].className = '';
                chain[i].push([y, x]);
            } else {
                break;
            }
        }
    }

    if (connected[i][rows - 1][columns - 1]
            && right[cellPipe[i][rows - 1][columns - 1]]) {
        if (!inProgress[i]) {
            // Game hasn't even started, so reconstruct puzzle
            return randomize(i);
        }

        // Set is complete
        inProgress[i] = false;
        countCompleted++;
        playSound("sndComplete");
        pipeElems[i][0][0].parentNode.lastChild.className = '';

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
for (var i = 0; i < pipeMap.length; i++)
    imageNames.push("pipe" + pipeMap[i]);

var container = document.getElementById("preload");
for (var i = 0; i < imageNames.length; i++) {
    var img = document.createElement("img");
    img.src = imageNames[i] + ".png";
    container.appendChild(img);
}

document.getElementById("pipeArea").addEventListener("mousedown", function(evt) {
    if (evt.target.hasAttribute("data-set") && inProgress[evt.target.getAttribute("data-set")]) {
        rotate(evt.target);
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

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service_worker.js', {scope: './'});
}

});
