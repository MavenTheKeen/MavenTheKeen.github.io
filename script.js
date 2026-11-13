(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function svgEl(name, attrs) {
    var node = document.createElementNS(SVG_NS, name);
    for (var key in attrs) node.setAttribute(key, attrs[key]);
    return node;
  }

  function each(list, fn) {
    Array.prototype.forEach.call(list, fn);
  }

  // Hero map
  // Dots run back and forth along each line. Every 10 seconds, on the wall
  // clock, the map "polls": the time updates and every dot pings.

  var POLL_MS = 10000;
  var PING_MS = 900;

  // line id, starting point (0 to 1 along the line), speed in map units per second
  var FLEET = [
    ["line-1", 0.06, 17], ["line-1", 0.3, -15], ["line-1", 0.52, 16], ["line-1", 0.74, -17], ["line-1", 0.93, 14],
    ["line-2", 0.1, 16], ["line-2", 0.38, -14], ["line-2", 0.62, 15], ["line-2", 0.88, -16],
    ["line-5", 0.18, 13], ["line-5", 0.5, -14], ["line-5", 0.8, 12],
    ["line-4", 0.4, 11],
    ["line-6", 0.6, -10]
  ];

  function two(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function startMap() {
    var hero = document.querySelector(".hero");
    var layer = document.getElementById("vehicles");
    var pollTime = document.getElementById("poll-time");
    var pollBar = document.getElementById("poll-bar");
    if (!hero || !layer || !pollTime || !pollBar) return;

    var vehicles = FLEET.map(function (spec) {
      var path = document.getElementById(spec[0]);
      var group = svgEl("g", {});
      var ping = svgEl("circle", { "class": "vehicle__ping", r: 7 });
      group.appendChild(ping);
      group.appendChild(svgEl("circle", { "class": "vehicle__body", r: 6.5 }));
      layer.appendChild(group);
      var length = path.getTotalLength();
      return { path: path, length: length, start: spec[1] * length, speed: spec[2], group: group, ping: ping };
    });

    var clock = 0;

    function place() {
      vehicles.forEach(function (v) {
        var span = v.length * 2;
        var d = (((v.start + v.speed * clock) % span) + span) % span;
        var point = v.path.getPointAtLength(d > v.length ? span - d : d);
        v.group.setAttribute("transform", "translate(" + point.x.toFixed(1) + " " + point.y.toFixed(1) + ")");
      });
    }

    place();
    if (reduceMotion) return;

    hero.classList.add("is-running");

    var visible = true;
    var frame = 0;
    var last = 0;
    var lastLabel = "";

    function tick(now) {
      frame = 0;
      if (!visible || document.hidden) return;

      if (last) clock += Math.min(now - last, 100) / 1000;
      last = now;
      place();

      var wall = Date.now();
      var sincePoll = wall % POLL_MS;
      var t = new Date(wall - sincePoll);
      var seconds = Math.floor(sincePoll / 1000);
      var label = "Last poll " + two(t.getHours()) + ":" + two(t.getMinutes()) + ":" + two(t.getSeconds()) +
        (seconds ? ", " + seconds + " s ago" : ", just now");
      if (label !== lastLabel) {
        pollTime.textContent = label;
        lastLabel = label;
      }
      pollBar.style.transform = "scaleX(" + (sincePoll / POLL_MS).toFixed(3) + ")";

      var p = sincePoll / PING_MS;
      vehicles.forEach(function (v) {
        if (p < 1) {
          v.ping.setAttribute("r", (7 + 15 * (1 - Math.pow(1 - p, 3))).toFixed(1));
          v.ping.style.opacity = (0.85 * (1 - p)).toFixed(2);
        } else if (v.ping.style.opacity !== "0") {
          v.ping.style.opacity = "0";
        }
      });

      frame = window.requestAnimationFrame(tick);
    }

    function wake() {
      if (!frame && visible && !document.hidden) {
        last = 0;
        frame = window.requestAnimationFrame(tick);
      }
    }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        wake();
      }).observe(hero);
    }
    document.addEventListener("visibilitychange", wake);
    wake();
  }

  // The ride
  // One line runs the length of the page and calls at every section. A train
  // follows the scroll position along it. Near a station it stops at the
  // platform and opens its doors, then pulls away when you scroll on. Behind
  // the train the line is solid. Ahead of it, it is only predicted.

  var CAR = 40;        // car length
  var PITCH = 44;      // distance between car centres
  var CARS = 3;
  var TAIL = CARS * PITCH + 10;
  var CAPTURE = 110;   // how close (along the line) counts as "at the station"

  function startRide() {
    var main = document.querySelector(".ride");
    var sections = main ? main.querySelectorAll("[data-stop]") : [];
    if (sections.length < 2) return;

    var nextLabel = document.getElementById("next-label");
    var nextName = document.getElementById("next-name");
    var dots = document.querySelectorAll(".strip__route li a");

    var svg = svgEl("svg", { "class": "ride__svg", "aria-hidden": "true" });
    var ahead = svgEl("path", { "class": "ride__ahead" });
    var done = svgEl("path", { "class": "ride__done" });
    var endBar = svgEl("line", { "class": "ride__end" });
    var stationLayer = svgEl("g", {});
    var train = svgEl("g", { "class": "train" });
    svg.appendChild(ahead);
    svg.appendChild(done);
    svg.appendChild(endBar);
    svg.appendChild(stationLayer);
    svg.appendChild(train);
    main.appendChild(svg);

    // The train: three cars, each with two sets of doors. Front is +x.
    var cars = [];
    for (var c = 0; c < CARS; c++) {
      var car = svgEl("g", {});
      var half = CAR / 2;
      var nose = c === 0 ? 7 : 3;
      var tail = c === CARS - 1 ? 7 : 3;
      car.appendChild(svgEl("path", {
        "class": "car__body",
        d: "M" + (-half + tail) + " -7.5 H" + (half - nose) +
          " Q" + half + " -7.5 " + half + " 0 Q" + half + " 7.5 " + (half - nose) + " 7.5 H" + (-half + tail) +
          " Q" + (-half) + " 7.5 " + (-half) + " 0 Q" + (-half) + " -7.5 " + (-half + tail) + " -7.5 Z"
      }));
      car.appendChild(svgEl("rect", { "class": "car__glass", x: -half + 6, y: -3, width: CAR - 12, height: 6, rx: 1.5 }));
      [-9, 9].forEach(function (x) {
        car.appendChild(svgEl("rect", { "class": "car__way", x: x - 4, y: -7.5, width: 8, height: 15 }));
        car.appendChild(svgEl("rect", { "class": "car__leaf car__leaf--a", x: x - 3.5, y: -6.5, width: 3.5, height: 13 }));
        car.appendChild(svgEl("rect", { "class": "car__leaf car__leaf--b", x: x, y: -6.5, width: 3.5, height: 13 }));
      });
      if (c === 0) car.appendChild(svgEl("circle", { "class": "car__light car__light--front", cx: half - 3.5, cy: 0, r: 2 }));
      if (c === CARS - 1) car.appendChild(svgEl("circle", { "class": "car__light car__light--back", cx: -half + 3.5, cy: 0, r: 2 }));
      train.appendChild(car);
      cars.push(car);
    }
    var lightFront = train.querySelector(".car__light--front");
    var lightBack = train.querySelector(".car__light--back");

    var total = 0;
    var stations = [];   // { s, node, name }
    var knots = [];      // [reference y, distance along the line]
    var top = 0;         // page offset of <main>
    var built = false;

    function roundedPath(pts, radius) {
      var d = "M" + pts[0][0] + " " + pts[0][1];
      for (var i = 1; i < pts.length - 1; i++) {
        var p = pts[i], a = pts[i - 1], b = pts[i + 1];
        var la = Math.hypot(a[0] - p[0], a[1] - p[1]);
        var lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
        var r = Math.min(radius, la / 2, lb / 2);
        d += " L" + (p[0] + (a[0] - p[0]) / la * r) + " " + (p[1] + (a[1] - p[1]) / la * r) +
          " Q" + p[0] + " " + p[1] + " " + (p[0] + (b[0] - p[0]) / lb * r) + " " + (p[1] + (b[1] - p[1]) / lb * r);
      }
      var last = pts[pts.length - 1];
      return d + " L" + last[0] + " " + last[1];
    }

    function build() {
      var W = main.clientWidth;
      var H = main.offsetHeight;
      top = main.getBoundingClientRect().top + window.scrollY;
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      svg.style.height = H + "px";

      var names = [];
      each(sections, function (section) {
        names.push(section.querySelector(".stop__name"));
      });
      var contentLeft = names[1].getBoundingClientRect().left;
      var winding = W >= 900;   // wide screens: the line crosses the page at each section
      var xL = winding ? Math.max(30, contentLeft - 58) : contentLeft - 27;
      var xR = W - xL;
      var scale = winding ? 1 : 0.72;
      var radius = winding ? 34 : 0;

      function nameTop(el) {
        return el.getBoundingClientRect().top + window.scrollY - top;
      }

      function firstLine(el) {
        return parseFloat(window.getComputedStyle(el).lineHeight) / 2 || 20;
      }

      var y0 = nameTop(names[0]) + firstLine(names[0]);
      var pts = [[xL, Math.max(8, y0 - TAIL * scale)], [xL, y0]];
      var marks = [[xL, y0]];
      var runs = [];
      var left = true;

      for (var j = 1; j < names.length; j++) {
        var isLast = j === names.length - 1;
        if (winding) {
          var y = Math.round(nameTop(names[j]) - 54);
          var stationX = contentLeft + 12;
          runs.push(y);
          marks.push([stationX, y]);
          pts.push([left ? xL : xR, y]);
          pts.push(isLast ? [stationX, y] : [left ? xR : xL, y]);
          left = !left;
        } else {
          var yy = nameTop(names[j]) + firstLine(names[j]);
          marks.push([xL, yy]);
          if (isLast) pts.push([xL, yy]);
        }
      }
      var d = roundedPath(pts, radius);
      ahead.setAttribute("d", d);
      done.setAttribute("d", d);
      total = done.getTotalLength();

      var end = pts[pts.length - 1];
      var prev = pts[pts.length - 2];
      var vertical = prev[0] === end[0];
      endBar.setAttribute("x1", end[0] - (vertical ? 13 : 0));
      endBar.setAttribute("x2", end[0] + (vertical ? 13 : 0));
      endBar.setAttribute("y1", end[1] - (vertical ? 0 : 13));
      endBar.setAttribute("y2", end[1] + (vertical ? 0 : 13));
      endBar.style.display = winding ? "none" : "";

      // Sample the line once, so stations and scroll positions can be looked up.
      var step = 4;
      var samples = [];
      for (var s = 0; s <= total; s += step) {
        var pt = done.getPointAtLength(s);
        samples.push([s, pt.x, pt.y]);
      }
      samples.push([total, end[0], end[1]]);

      stationLayer.textContent = "";
      stations = marks.map(function (mark, i) {
        var best = 0, bestD = Infinity;
        samples.forEach(function (sample) {
          var dist = Math.abs(sample[1] - mark[0]) + Math.abs(sample[2] - mark[1]);
          if (dist < bestD) { bestD = dist; best = sample[0]; }
        });
        var node = svgEl("g", { "class": "station" + (i === 0 ? " station--dark" : ""), transform: "translate(" + mark[0] + " " + mark[1] + ")" });
        node.appendChild(svgEl("circle", { "class": "station__ping", r: 10 }));
        node.appendChild(svgEl("circle", { r: winding ? 10 : 8 }));
        stationLayer.appendChild(node);
        var at = i === marks.length - 1 ? total : best;
        return { s: at, stop: at - 14 * scale, node: node, name: sections[i].getAttribute("data-stop") };
      });

      // Knots: which point on the line belongs to which height on the page.
      knots = [[y0, stations[0].s]];
      if (winding) {
        var gap = Infinity;
        for (var k = 1; k < runs.length; k++) gap = Math.min(gap, runs[k] - runs[k - 1]);
        var reach = Math.max(60, Math.min(190, gap / 2 - 30));
        runs.forEach(function (runY, k) {
          var from = null, to = null;
          samples.forEach(function (sample) {
            if (from === null && sample[2] > runY - radius - 1) from = sample[0];
            if (sample[2] < runY + radius + 1) to = sample[0];
          });
          knots.push([runY - reach, from]);
          knots.push([runY + reach, k === runs.length - 1 ? total : to]);
        });
      } else {
        knots.push([end[1], total]);
      }

      train.setAttribute("data-scale", scale);
      built = true;
      state.shown = -1;
      onScroll(true);
    }

    function lineAt(ref) {
      if (ref <= knots[0][0]) return knots[0][1];
      for (var i = 1; i < knots.length; i++) {
        if (ref <= knots[i][0]) {
          var a = knots[i - 1], b = knots[i];
          return a[1] + (b[1] - a[1]) * (ref - a[0]) / (b[0] - a[0]);
        }
      }
      return total;
    }

    // Where the scroll position says the train should be.
    function wanted() {
      var vh = window.innerHeight;
      var max = Math.max(1, document.documentElement.scrollHeight - vh);
      var p = Math.min(1, window.scrollY / max);
      var first = (knots[0][0] + top) / vh;
      var lastKnot = knots[knots.length - 1][0] + top;
      var final = Math.min(0.9, Math.max(0.5, (lastKnot + 20 - max) / vh));
      var ref = window.scrollY + vh * (first + (final - first) * p) - top;
      return lineAt(ref);
    }

    var state = {
      s: 0, v: 0, target: 0,
      at: 0,            // station the train is held at, or -1
      aim: -1,          // station it is pulling in to, or -1
      open: false,
      holdUntil: 0,
      shown: -1,
      text: "",
      frame: 0,
      last: 0
    };

    function nearest(s) {
      var best = -1, bestD = CAPTURE;
      stations.forEach(function (station, i) {
        var dist = Math.abs(station.stop - s);
        if (dist < bestD) { bestD = dist; best = i; }
      });
      return best;
    }

    function setDoors(open) {
      if (state.open === open) return;
      state.open = open;
      train.classList.toggle("is-open", open);
    }

    function announce() {
      var passed = -1;
      stations.forEach(function (station, i) {
        if (station.stop <= state.s + 4) passed = i;
      });
      if (passed !== state.shown) {
        stations.forEach(function (station, i) {
          station.node.classList.toggle("is-passed", i <= passed);
        });
        each(dots, function (dot, i) {
          if (i === passed) dot.setAttribute("aria-current", "true");
          else dot.removeAttribute("aria-current");
        });
        state.shown = passed;
      }

      var here = state.open && state.at > -1;
      var label, name;
      if (here) {
        label = state.at === stations.length - 1 ? "Terminus" : "Now at";
        name = stations[state.at].name;
      } else {
        var goingBack = state.target < state.s - 2;
        var index = goingBack ? Math.max(0, passed) : Math.min(stations.length - 1, passed + 1);
        if (state.aim > -1) index = state.aim;   // pulling in
        label = "Next stop";
        name = stations[index].name;
      }
      var text = label + "|" + name;
      if (text !== state.text && nextLabel && nextName) {
        nextLabel.textContent = label;
        if (nextName.textContent !== name) {
          nextName.textContent = name;
          nextName.classList.remove("is-rolling");
          void nextName.offsetWidth;
          nextName.classList.add("is-rolling");
        }
        state.text = text;
      }
    }

    function draw() {
      var s = state.s;
      done.style.strokeDasharray = Math.max(0.01, s) + " " + (total + 20);
      var scale = train.getAttribute("data-scale");
      cars.forEach(function (car, i) {
        var centre = s - (CAR / 2 + i * PITCH) * scale;
        var a = done.getPointAtLength(Math.max(0, centre - 9 * scale));
        var b = done.getPointAtLength(Math.max(0.5, centre + 9 * scale));
        var angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
        car.setAttribute("transform",
          "translate(" + ((a.x + b.x) / 2).toFixed(2) + " " + ((a.y + b.y) / 2).toFixed(2) + ") rotate(" + angle.toFixed(2) + ") scale(" + scale + ")");
      });
    }

    function tick(now) {
      state.frame = 0;
      var dt = Math.min(0.05, (now - (state.last || now)) / 1000) || 0.016;
      state.last = now;

      var station = nearest(state.target);
      state.aim = station;
      var goal = station > -1 ? stations[station].stop : state.target;

      // Leaving: the doors close first, then the train pulls away.
      if (state.open && station !== state.at) {
        setDoors(false);
        state.holdUntil = now + 90;
      }

      var waiting = state.open || now < state.holdUntil;
      var settled = waiting;

      if (!waiting) {
        // Critically damped spring: it gathers speed out of a station and brakes into the next.
        var omega = 2 / 0.145;
        var x = omega * dt;
        var decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
        var change = state.s - goal;
        // After a long jump (a link in the page), skip most of the trip.
        if (Math.abs(change) > 1400) change = change > 0 ? 1400 : -1400;
        var temp = (state.v + omega * change) * dt;
        state.v = (state.v - omega * temp) * decay;
        state.s = goal + (change + temp) * decay;
        state.at = -1;

        settled = Math.abs(state.s - goal) < 1.5 && Math.abs(state.v) < 30;
        if (settled) {
          state.s = goal;
          state.v = 0;
          if (station > -1) {
            // Arrived: doors open and the station answers.
            state.at = station;
            setDoors(true);
            var node = stations[station].node;
            node.classList.remove("is-pinged");
            void node.getBoundingClientRect();
            node.classList.add("is-pinged");
          }
        }
      }

      if (Math.abs(state.v) > 20) {
        var forward = state.v > 0;
        lightFront.classList.toggle("is-on", forward);
        lightBack.classList.toggle("is-on", !forward);
      }

      draw();
      announce();

      if (!settled || now < state.holdUntil) {
        state.frame = window.requestAnimationFrame(tick);
      } else {
        state.last = 0;
      }
    }

    function onScroll(jump) {
      if (!built) return;
      state.target = wanted();

      if (reduceMotion) {
        // No train. The line is drawn in full and the strip names the section.
        state.s = state.target;
        var here = nearest(state.target);
        state.at = here;
        state.open = here > -1;
        done.style.strokeDasharray = "none";
        announce();
        stations.forEach(function (station) { station.node.classList.add("is-passed"); });
        return;
      }

      if (jump === true) {
        state.s = state.target;
        state.v = 0;
        var station = nearest(state.s);
        if (station > -1) state.s = stations[station].stop;
        setDoors(false);
        state.at = -1;
        draw();
      }
      if (!state.frame) state.frame = window.requestAnimationFrame(tick);
    }

    if (reduceMotion) train.style.display = "none";
    lightFront.classList.add("is-on");

    var resizeTimer = 0;
    function rebuild() {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(build, 120);
    }

    build();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", rebuild);
    window.addEventListener("load", build);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
    if ("ResizeObserver" in window) new ResizeObserver(rebuild).observe(main);
  }

  // Station board
  // Counts the minutes down while the board is on screen.

  function startBoard() {
    var board = document.getElementById("board");
    if (!board || reduceMotion) return;
    var figure = board.closest ? board.closest("[data-live]") : null;
    var cells = board.querySelectorAll("b");

    setInterval(function () {
      if (figure && !figure.classList.contains("is-live")) return;
      each(cells, function (cell, i) {
        var min = Number(cell.getAttribute("data-min")) - 1;
        if (min < 0) min = 5 + ((i * 2) % 4);
        cell.setAttribute("data-min", String(min));
        cell.textContent = min === 0 ? "Due" : min + " min";
        cell.classList.toggle("is-due", min === 0);
      });
    }, 2400);
  }

  // Wait slider
  // Six headways over 30 minutes, scheduled at 5 minutes each. The slider
  // stretches one gap and squeezes the rest. Extra wait is
  // sum(h^2) / (2 * sum(h)) minus half the scheduled headway.

  function startWait() {
    var root = document.getElementById("wait");
    var range = document.getElementById("wait-range");
    if (!root || !range) return;

    var ticks = root.querySelectorAll(".wait__ticks i");
    var trains = root.querySelectorAll(".wait__trains i");
    var outWait = document.getElementById("wait-ewt");
    var outGap = document.getElementById("wait-gap");
    var outGrade = document.getElementById("wait-grade");
    var scheduled = 5;
    var count = 6;
    var span = scheduled * count;

    each(ticks, function (tick, i) { tick.style.setProperty("--x", String(i / count)); });

    function grade(seconds) {
      if (seconds <= 30) return "A";
      if (seconds <= 60) return "B";
      if (seconds <= 120) return "C";
      if (seconds <= 240) return "D";
      return "F";
    }

    function draw() {
      var b = Number(range.value) / 100;
      var long = scheduled + 20 * b;
      var short = scheduled - 4 * b;
      var gaps = [short, short, long, short, short, short];
      var at = 0;
      var squares = 0;

      each(trains, function (train, i) {
        train.style.setProperty("--x", String(at / span));
        if (i < count) {
          at += gaps[i];
          squares += gaps[i] * gaps[i];
        }
      });

      var seconds = Math.round((squares / (2 * span) - scheduled / 2) * 60);
      var letter = grade(seconds);
      outWait.textContent = seconds < 60 ? seconds + " s" : Math.floor(seconds / 60) + " min " + two(seconds % 60) + " s";
      outGap.textContent = (Math.round(long * 10) / 10) + " min";
      outGrade.textContent = letter;
      outGrade.setAttribute("data-grade", letter);
    }

    range.addEventListener("input", draw);
    draw();
  }

  // Off screen

  function startObservers() {
    var live = document.querySelectorAll("[data-live]");
    var once = document.querySelectorAll("[data-once]");

    if (!("IntersectionObserver" in window)) {
      each(live, function (el) { el.classList.add("is-live"); });
      each(once, function (el) { el.classList.add("in-view"); });
      return;
    }

    var liveObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        entry.target.classList.toggle("is-live", entry.isIntersecting);
      });
    });
    each(live, function (el) { liveObserver.observe(el); });

    var onceObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          onceObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -18% 0px" });
    each(once, function (el) { onceObserver.observe(el); });
  }

  startMap();
  startBoard();
  startWait();
  startRide();
  startObservers();

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
