var request = require("request");
var $ = require('jquery')(require("jsdom").jsdom().parentWindow);
var fs = require('fs');
var CronJob = require('cron').CronJob;
var nodewhal = require('nodewhal');
var FlairEnum = Object.freeze({DAILY: 0, WEEKLY: 1, MONTHLY: 2});

//Prototype changes.
if (!String.prototype.format) {
    String.prototype.format = function () {
        var args = arguments;
        return this.replace(/{(\d+)}/g, function (match, number) {
            return typeof args[number] != 'undefined'
                    ? args[number]
                    : match
                    ;
        });
    };
}

if (!Date.prototype.yyyymmdd)
{
    Date.prototype.yyyymmdd = function () {

        var yyyy = this.getFullYear().toString();
        var mm = (this.getMonth() + 1).toString(); // getMonth() is zero-based         
        var dd = this.getDate().toString();

        return yyyy + '-' + (mm[1] ? mm : "0" + mm[0]) + '-' + (dd[1] ? dd : "0" + dd[0]);
    };
}


function generateReport(interval) // 0 = Day, 1 = Week, 2 = Month
{
    request({
        uri: "http://tagpro-origin.koalabeast.com/boards",
    }, function (error, response, body) {
        var out = {};
        //var obj = $(body).find("#Day");
        $(body).find("#" + getTextName(interval) + " table tr").each(function (index, domObject) {
            if (index != 0)
            {
                out[index] = {};
                var obj = $(domObject);
                out[index].rank = index;
                out[index].name = $(obj.children()[1]).text();
                out[index].link = $(obj.children()[1]).find("a")[0].href;
                out[index].link = out[index].link.substring(out[index].link.indexOf("/profile/"));
                out[index].id = getProfileId(out[index].link);
                out[index].points = $(obj.children()[2]).text();
            }
        });

        var profiles = "";
        for (i = 1; i < 100; i++)
        {
            profiles += out[i].id + ",";
        }
        profiles += out[100].id;

        request({
            uri: "http://tagpro-origin.koalabeast.com/profiles/" + profiles,
        }, function (error2, response2, body2) {
            var stats = JSON.parse(body2);
            for (i = 1; i <= 100; i++)
            {
                var player = searchForStats(stats, out[i].id, 0, 99)
                out[i].daily = player.stats.today;
                out[i].weekly = player.stats.week;
                out[i].monthly = player.stats.month;

                out[i].daily.win = player.won.today;
                out[i].daily.lose = player.lost.today;
                out[i].daily.games = player.games.today;
                out[i].daily.percent = (player.won.today / player.games.today) * 100;
                out[i].daily.timePlayed = player.timePlayed.today;


                out[i].weekly.win = player.won.week;
                out[i].weekly.lose = player.lost.week;
                out[i].weekly.games = player.games.week;
                out[i].weekly.percent = (player.won.week / player.games.week) * 100;
                out[i].weekly.timePlayed = player.timePlayed.week;

                out[i].monthly.win = player.won.month;
                out[i].monthly.lose = player.lost.month;
                out[i].monthly.games = player.games.month;
                out[i].monthly.percent = (player.won.month / player.games.month) * 100;
                out[i].monthly.timePlayed = player.timePlayed.month;
            }

            var fileText = "|Rank|Player|Rank Points|Time|W|L|Games|W%|Tags|Popped|Grabs|Drops|Hold|Caps|Prevent|Returns|Support\n";
            fileText += "|:-|:-|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:\n";

            for (i = 1; i <= 100; i++)
            {
                var data = getObj(interval, out[i]);
                fileText += "|{0}|{1}|{2}|{3}|{4}|{5}|{6}|{7}|{8}|{9}|{10}|{11}|{12}|{13}|{14}|{15}|{16}\n".format(i, makeName(interval, out[i]), out[i].points, prettyTime(data.timePlayed), data.win,
                        data.lose, data.games, Math.round(data.percent) + "%", data.tags, data.pops,
                        data.grabs, data.drops, prettyTime(data.hold), data.captures,
                        prettyTime(data.prevent), data.returns, prettyTime(data.support));
            }

            var d = new Date();
            var fileName = "/tmp/" + getFlairName(interval) + "-" + d.yyyymmdd();
            fs.writeFile(fileName, fileText, function (err) {
                if (err) {
                    console.log(err);
                } else {
                    console.log("The file was saved! - " + fileName);
                }
            });
            postTextToReddit(interval, fileText);
        });
    });
}

function postTextToReddit(type, text)
{
    var title = getFlairName(type)+" Leaderboard Log/Statistics for "+new Date().yyyymmdd();
    // console.log("Title:",title);
    // console.log("Text:",text)
    nodewhal('bizkut-leaderboard-post').login(process.env.USERNAME, process.env.PASSWORD).then(function(userLogin) {
        return userLogin.submit('Tagpro', 'self',
            title,
            text
        )
    }).then(function(newSubmission) {
        console.log("Posted to", newSubmission.url);
    }, function(error) {
        console.error("There was a problem", error);
    });
}

function getProfileId(link)
{
    return link.substring(link.lastIndexOf("/") + 1);
}

//binary search on _id
function searchForStats(list, pid, min, max)
{
    if (max < min)
    {
        return null;
    }
    else
    {
        var mid = (min + max) / 2 | 0;
        if (list[mid]._id > pid)
        {
            return searchForStats(list, pid, min, mid - 1);
        }
        else if (list[mid]._id < pid)
        {
            return searchForStats(list, pid, mid + 1, max);
        }
        else
        {
            return list[mid];
        }
    }
}

function prettyTime(seconds)
{
    var hours = seconds / 3600 | 0;
    seconds = seconds % 3600;
    var minutes = seconds / 60 | 0;
    seconds = seconds % 60;

    return hours + ":" + ("0" + minutes).slice(-2) + ":" + ("0" + seconds).slice(-2);
}



function getTextName(type)
{
    switch (type)
    {
        case FlairEnum.DAILY:
            return "Day";
        case FlairEnum.WEEKLY:
            return "Week";
        case FlairEnum.MONTHLY:
            return "Month";
        default:
            return "Day";
    }
}

function getFlairName(type)
{
    switch (type)
    {
        case FlairEnum.DAILY:
            return "Daily";
        case FlairEnum.WEEKLY:
            return "Weekly";
        case FlairEnum.MONTHLY:
            return "Monthly";
        default:
            return "Daily";
    }
}

function getObj(type, major)
{
    switch (type)
    {
        case FlairEnum.DAILY:
            return major.daily;
        case FlairEnum.WEEKLY:
            return major.weekly;
        case FlairEnum.MONTHLY:
            return major.monthly;
        default:
            return major.daily;
    }
}

function makeName(type, player)
{
    var name = "";
    if (player.rank <= 3)
    {
        name = "[](#flair-" + getFlairName(type) + ")[" + sanatizeName(player.name) + "](http://tagpro-pi.koalabeast.com/profile/" + player.id + ")";
    }
    else if (player.rank <= 10)
    {
        name = "[" + sanatizeName(player.name) + "](http://tagpro-pi.koalabeast.com/profile/" + player.id + ")";
    }
    else
    {
        name = sanatizeName(player.name);
    }
    return name;
}

function sanatizeName(name)
{
    while(name.indexOf('|') > -1)
    {
        name.replace('|','');
    }
    return "`"+name+"`";
}

var daily = new CronJob('00 55 14 * * *', function () {
    //Runs every day at 2:55 PM
    var text = generateReport(FlairEnum.DAILY);
});

var weekly = new CronJob('00 56 14 * * 0', function () {
    //Runs every Sunday at 2:56 PM
    var text = generateReport(FlairEnum.WEEKLY);
});

var monthly = new CronJob('00 54 14 1 * *', function () {
    //Runs every day at 2:54 PM
    var text = generateReport(FlairEnum.MONTHLY);
});

daily.start();
weekly.start();
monthly.start();