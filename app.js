(function ($) {
  "use strict";

  const BANKS = {
    "970423": { code: "TPBank", name: "Ngân hàng TMCP Tiên Phong", css: "tpbank", logo: "https://cdn.vietqr.io/img/TPB.png" },
    "970422": { code: "MBBank", name: "Ngân hàng TMCP Quân đội", css: "mb", logo: "https://cdn.vietqr.io/img/MB.png" },
    "970436": { code: "Vietcombank", name: "Ngân hàng TMCP Ngoại thương Việt Nam", css: "vcb", logo: "https://cdn.vietqr.io/img/VCB.png" },
    "970418": { code: "BIDV", name: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam", css: "bidv", logo: "https://cdn.vietqr.io/img/BIDV.png" },
    "970407": { code: "Techcombank", name: "Ngân hàng TMCP Kỹ thương Việt Nam", css: "tcb", logo: "https://cdn.vietqr.io/img/TCB.png" },
    "970415": { code: "VietinBank", name: "Ngân hàng TMCP Công thương Việt Nam", css: "generic", logo: "https://cdn.vietqr.io/img/ICB.png" },
    "970432": { code: "VPBank", name: "Ngân hàng TMCP Việt Nam Thịnh Vượng", css: "generic", logo: "https://cdn.vietqr.io/img/VPB.png" },
    "970403": { code: "Sacombank", name: "Ngân hàng TMCP Sài Gòn Thương Tín", css: "generic", logo: "https://cdn.vietqr.io/img/STB.png" },
    "970416": { code: "ACB", name: "Ngân hàng TMCP Á Châu", css: "generic", logo: "https://cdn.vietqr.io/img/ACB.png" },
    "970405": { code: "Agribank", name: "Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam", css: "generic", logo: "https://cdn.vietqr.io/img/VBA.png" }
  };

  function requestVietQrJson(url) {
    return new Promise((resolve) => {
      $.ajax({ url, dataType: "json", timeout: 3500 })
        .done(resolve)
        .fail(() => resolve(null));
    });
  }

  const bankCatalogReady = Promise.all([
    requestVietQrJson("https://api.vietqr.io/v2/banks"),
    requestVietQrJson("https://api.vietqr.io/v2/android-app-deeplinks")
  ]).then(([bankResponse, appResponse]) => {
    const appIcons = {};
    if (appResponse && Array.isArray(appResponse.apps)) {
      appResponse.apps.forEach((app) => {
        const appId = String(app.appId || "").toLowerCase();
        if (appId && app.appLogo && !appIcons[appId]) appIcons[appId] = app.appLogo;
      });
    }

    if (bankResponse && Array.isArray(bankResponse.data)) {
      bankResponse.data.forEach((item) => {
        if (!item.bin) return;
        const bankCode = String(item.code || "").toLowerCase();
        BANKS[String(item.bin)] = {
          code: item.shortName || item.code || `BIN ${item.bin}`,
          name: item.name || item.shortName || `Ngân hàng BIN ${item.bin}`,
          css: "official",
          logo: item.logo || "",
          icon: appIcons[bankCode] || ""
        };
      });
    }
  });

  const state = {
    stream: null,
    scanning: false,
    recipient: null,
    amount: 0,
    receiptTime: null
  };

  const bankLogoCache = new Map();

  const $video = $("#camera");
  const video = $video[0];
  const scanCanvas = $("#scanCanvas")[0];
  const scanCtx = scanCanvas.getContext("2d", { willReadFrequently: true });
  const receiptCanvas = $("#receiptCanvas")[0];
  const receiptCtx = receiptCanvas.getContext("2d");
  const receiptBackground = new Image();
  receiptBackground.src = "1.png";

  function showScreen(id) {
    $(".screen").removeClass("active");
    $(id).addClass("active");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function setStatus(message, isError) {
    $("#scanStatus").text(message).toggleClass("error", Boolean(isError));
  }

  function parseTlv(value) {
    const fields = {};
    let cursor = 0;
    while (cursor + 4 <= value.length) {
      const id = value.slice(cursor, cursor + 2);
      const lengthText = value.slice(cursor + 2, cursor + 4);
      if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lengthText)) break;
      const length = Number(lengthText);
      const start = cursor + 4;
      const end = start + length;
      if (end > value.length) break;
      if (fields[id] === undefined) fields[id] = value.slice(start, end);
      cursor = end;
    }
    return fields;
  }

  function titleCaseName(name) {
    const clean = String(name || "").replace(/\s+/g, " ").trim();
    return clean;
  }

  function findVietQrProvider(root) {
    for (let id = 26; id <= 51; id += 1) {
      const value = root[String(id).padStart(2, "0")];
      if (!value) continue;
      const provider = parseTlv(value);
      if (provider["00"] === "A000000727" || value.includes("A000000727")) return provider;
    }
    return {};
  }

  function momoBank() {
    return BANKS["971025"] || {
      code: "MoMo",
      name: "Ví điện tử MoMo",
      css: "official",
      logo: "https://cdn.vietqr.io/img/momo.png"
    };
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(String(value || "").replace(/\+/g, " "));
    } catch (error) {
      return String(value || "");
    }
  }

  function parseMomoPayload(payload) {
    const raw = String(payload || "").trim();
    const parts = raw.split("|");

    // QR cá nhân MoMo: 2|99|số điện thoại|họ tên||0|0|số tiền||transfer_myqr
    if (parts[0] === "2" && parts[1] === "99" && parts.length >= 4) {
      const phone = safeDecode(parts[2]).trim();
      const name = safeDecode(parts[3]).trim();
      const amount = Number(String(parts[7] || "").replace(/\D/g, ""));
      if (phone) {
        return {
          name: titleCaseName(name),
          account: phone,
          bankBin: "971025",
          bank: momoBank(),
          amount: Number.isSafeInteger(amount) ? amount : 0,
          raw,
          source: "momo-personal"
        };
      }
    }

    // QR/deeplink merchant MoMo chỉ dùng các trường thực sự có trong URL.
    if (/momo/i.test(raw) && /^(https?:|momo:)/i.test(raw)) {
      try {
        const url = new URL(raw);
        const params = url.searchParams;
        const name = params.get("merchantname") || params.get("partnerName") || params.get("storeName");
        const account = params.get("partnerCode") || params.get("storeId") || params.get("mobile");
        const amount = Number(String(params.get("amount") || "").replace(/\D/g, ""));
        if (name && account) {
          return {
            name: titleCaseName(name),
            account,
            bankBin: "971025",
            bank: momoBank(),
            amount: Number.isSafeInteger(amount) ? amount : 0,
            raw,
            source: "momo-merchant"
          };
        }
        throw new Error("QR MoMo này là mã thanh toán dạng token; cần API MoMo của tài khoản doanh nghiệp để lấy thông tin thật.");
      } catch (error) {
        if (error instanceof TypeError) return null;
        throw error;
      }
    }

    return null;
  }

  function parseVietQr(payload) {
    const momo = parseMomoPayload(payload);
    if (momo) return momo;

    const root = parseTlv(String(payload || "").trim());
    const provider = findVietQrProvider(root);
    const service = parseTlv(provider["01"] || "");
    let bankBin = service["00"] || "";
    const vietQrAccount = service["01"] || provider["01"] || "";
    // Một số QR TPBank/Napas đồng thời chứa alias ở trường VietQR 38
    // và số tài khoản dạng số ở cuối trường 15 (như qr-sample.png).
    const legacyAccountMatch = String(root["15"] || "").match(/0000(\d{8,19})$/);
    const account = legacyAccountMatch ? legacyAccountMatch[1] : vietQrAccount;
    const additionalData = parseTlv(root["62"] || "");
    const reference = additionalData["05"] || additionalData["08"] || "";
    const isMomoVietQr = bankBin === "971025" || /^99MM/i.test(account) || /^MOMOW2W/i.test(reference);
    if (isMomoVietQr) bankBin = "971025";

    const bank = isMomoVietQr ? momoBank() : (BANKS[bankBin] || {
      code: bankBin ? `BIN ${bankBin}` : "Ngân hàng",
      name: bankBin ? `Ngân hàng BIN ${bankBin}` : "Không xác định",
      css: "generic"
    });

    if (!account || !bankBin) {
      throw new Error("QR không chứa thông tin tài khoản VietQR/MoMo được hỗ trợ.");
    }

    const amount = Number(String(root["54"] || "").replace(/[^\d.]/g, ""));

    return {
      name: titleCaseName(root["59"]),
      account,
      bankBin,
      bank,
      amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0,
      purpose: additionalData["08"] || "",
      raw: payload
    };
  }

  function decodeImageSource(source, width, height) {
    if (typeof window.jsQR !== "function") {
      throw new Error("Không tải được thư viện đọc QR. Hãy kiểm tra kết nối mạng.");
    }
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    scanCanvas.width = Math.max(1, Math.round(width * scale));
    scanCanvas.height = Math.max(1, Math.round(height * scale));
    scanCtx.drawImage(source, 0, 0, scanCanvas.width, scanCanvas.height);
    const imageData = scanCtx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
    return window.jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth"
    });
  }

  function extractRecipientNameFromText(text) {
    const excluded = /(?:QU[EÉ]T|CHUY[EỂ]N|TI[EỀ]N|VIETQR|NAPAS|NG[AÂ]N H[AÀ]NG|BANK|ACCOUNT|T[AÀ]I KHO[AẢ]N|VND|QR CODE)/i;
    const candidates = String(text || "")
      .split(/\r?\n/)
      .map((line) => line.replace(/[^\p{L}\s'.-]/gu, " ").replace(/\s+/g, " ").trim())
      .filter((line) => {
        const words = line.split(" ").filter(Boolean);
        const letters = line.replace(/[^\p{L}]/gu, "");
        return words.length >= 2 && words.length <= 7 && letters.length >= 5 && line === line.toUpperCase() && !excluded.test(line);
      })
      .sort((a, b) => b.replace(/\s/g, "").length - a.replace(/\s/g, "").length);
    return candidates[0] || "";
  }

  async function readRecipientNameWithOcr(source) {
    if (!source || !window.Tesseract || typeof window.Tesseract.createWorker !== "function") return "";
    setStatus("QR không chứa tên, đang đọc phần chữ trên ảnh…");
    let worker;
    try {
      worker = await window.Tesseract.createWorker("eng", 1, {
        logger: (message) => {
          if (message.status === "recognizing text" && Number.isFinite(message.progress)) {
            setStatus(`Đang đọc tên người nhận… ${Math.round(message.progress * 100)}%`);
          }
        }
      });
      const result = await worker.recognize(source);
      return extractRecipientNameFromText(result.data && result.data.text);
    } catch (error) {
      return "";
    } finally {
      if (worker) await worker.terminate();
    }
  }

  function applyRecipient(recipient) {
    state.recipient = recipient;
    const hasQrName = Boolean(recipient.name);
    $("#recipientName").text(hasQrName ? recipient.name : "CHƯA CÓ TÊN NGƯỜI NHẬN");
    $("#recipientNameEditor").prop("hidden", hasQrName);
    $("#manualRecipientName").val("");
    $("#bankName").text(recipient.bank.code);
    $("#accountNumber").text(recipient.account);
    $("#bankLogo")
      .removeClass("tpbank mb vcb bidv tcb generic official")
      .addClass(recipient.bank.css)
      .find("span")
      .attr("data-code", recipient.bank.code.slice(0, 5).toUpperCase());
    const $logoBox = $("#bankLogo");
    const $logoImage = $("#bankLogoImage");
    $logoBox.removeClass("has-image");
    $logoImage.off(".bankLogo").removeAttr("src");
    const bankVisual = recipient.bank.icon || recipient.bank.logo;
    if (bankVisual) {
      $logoImage
        .one("load.bankLogo", () => $logoBox.addClass("has-image"))
        .one("error.bankLogo", () => $logoBox.removeClass("has-image"))
        .attr("src", bankVisual);
    }
    if (recipient.amount > 0) {
      $("#amount").val(formatAmountInput(recipient.amount)).trigger("input");
    } else {
      $("#amount").val("").trigger("input");
    }
    stopCamera();
    showScreen("#confirmScreen");
    setTimeout(() => $(hasQrName ? "#amount" : "#manualRecipientName").trigger("focus"), 120);
  }

  async function processQrResult(result, ocrSource) {
    if (!result || !result.data) throw new Error("Không tìm thấy mã QR trong ảnh.");
    await bankCatalogReady;
    const recipient = parseVietQr(result.data);
    if (!recipient.name && ocrSource) recipient.name = await readRecipientNameWithOcr(ocrSource);
    applyRecipient(recipient);
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("Trình duyệt không hỗ trợ camera. Hãy chọn một ảnh QR.", true);
      return;
    }
    stopCamera();
    setStatus("Đang yêu cầu quyền camera…");
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false
      });
      video.srcObject = state.stream;
      await video.play();
      state.scanning = true;
      $("#cameraFrame").addClass("streaming");
      $("#startCamera").text("Dừng camera");
      setStatus("Đưa toàn bộ mã QR vào trong khung");
      requestAnimationFrame(scanVideoFrame);
    } catch (error) {
      setStatus("Không mở được camera. Hãy cấp quyền hoặc chọn ảnh QR.", true);
    }
  }

  function stopCamera() {
    state.scanning = false;
    if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
    video.srcObject = null;
    $("#cameraFrame").removeClass("streaming");
    $("#startCamera").text("Mở camera");
  }

  function scanVideoFrame() {
    if (!state.scanning) return;
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      try {
        const result = decodeImageSource(video, video.videoWidth, video.videoHeight);
        if (result) {
          state.scanning = false;
          setStatus("Đã nhận diện QR, đang tải thông tin ngân hàng…");
          processQrResult(result, scanCanvas).catch((error) => {
            setStatus(error.message, true);
            stopCamera();
          });
          return;
        }
      } catch (error) {
        setStatus(error.message, true);
        stopCamera();
        return;
      }
    }
    requestAnimationFrame(scanVideoFrame);
  }

  function loadQrImage(url, revokeAfter) {
    const image = new Image();
    image.onload = async function () {
      try {
        const result = decodeImageSource(image, image.naturalWidth, image.naturalHeight);
        await processQrResult(result, scanCanvas);
      } catch (error) {
        setStatus(error.message, true);
      } finally {
        if (revokeAfter) URL.revokeObjectURL(url);
      }
    };
    image.onerror = function () {
      setStatus("Không thể mở ảnh QR.", true);
      if (revokeAfter) URL.revokeObjectURL(url);
    };
    image.src = url;
  }

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function formatAmountInput(value) {
    const digits = digitsOnly(value).slice(0, 15);
    return digits ? Number(digits).toLocaleString("vi-VN") : "";
  }

  function formatMoney(value) {
    return Number(value).toLocaleString("en-US") + " VND";
  }

  function formatAccount(value) {
    return String(value || "").replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
  }

  function twoDigits(value) {
    return String(value).padStart(2, "0");
  }

  function dateParts(date) {
    const time = `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
    const day = `${twoDigits(date.getDate())}/${twoDigits(date.getMonth() + 1)}/${date.getFullYear()}`;
    return { time, full: `${time} ${day}` };
  }

  function fitText(ctx, text, maxWidth, startSize, weight, minSize = 20) {
    let size = startSize;
    do {
      ctx.font = `${weight || 600} ${size}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif`;
      if (ctx.measureText(text).width <= maxWidth) return size;
      size -= 2;
    } while (size >= minSize);
    return size;
  }

  function drawTpBankMark(ctx, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size, size * .2);
    ctx.lineTo(size * .4, size);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, "#ffb326");
    gradient.addColorStop(.52, "#ff7218");
    gradient.addColorStop(.53, "#e53270");
    gradient.addColorStop(1, "#7926ce");
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();
  }

  function loadBankLogo(bank) {
    const bankVisual = bank.icon || bank.logo;
    if (!bankVisual) return Promise.resolve(null);
    if (bankLogoCache.has(bankVisual)) return bankLogoCache.get(bankVisual);

    const request = new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = bankVisual;
    });
    bankLogoCache.set(bankVisual, request);
    return request;
  }

  function drawBankLogo(ctx, bank, centerX, centerY, logoImage) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, 22, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    if (logoImage) {
      const maxWidth = 36;
      const maxHeight = 29;
      const scale = Math.min(maxWidth / logoImage.naturalWidth, maxHeight / logoImage.naturalHeight);
      const width = logoImage.naturalWidth * scale;
      const height = logoImage.naturalHeight * scale;
      ctx.drawImage(logoImage, centerX - width / 2, centerY - height / 2, width, height);
    } else if (bank.css === "tpbank") {
      ctx.fillStyle = "#4c1769";
      ctx.fill();
      drawTpBankMark(ctx, centerX - 12, centerY - 12, 25);
    } else {
      ctx.fillStyle = bank.css === "vcb" ? "#087c51" : bank.css === "bidv" ? "#056e91" : "#d91d4d";
      ctx.font = "800 12px -apple-system, BlinkMacSystemFont, 'SF Pro Text', Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(bank.code.slice(0, 4).toUpperCase(), centerX, centerY + 1);
    }
    ctx.restore();
  }

  async function renderReceipt() {
    const bgReady = receiptBackground.complete && receiptBackground.naturalWidth;
    if (!bgReady) {
      await new Promise((resolve) => {
        receiptBackground.addEventListener("load", resolve, { once: true });
        receiptBackground.addEventListener("error", resolve, { once: true });
      });
    }
    const recipient = state.recipient;
    const now = state.receiptTime;
    const stamp = dateParts(now);
    receiptCanvas.width = receiptBackground.naturalWidth;
    receiptCanvas.height = receiptBackground.naturalHeight;
    const w = receiptCanvas.width;
    const officialBankLogo = await loadBankLogo(recipient.bank);

    receiptCtx.clearRect(0, 0, receiptCanvas.width, receiptCanvas.height);
    receiptCtx.drawImage(receiptBackground, 0, 0, receiptCanvas.width, receiptCanvas.height);
    receiptCtx.textBaseline = "alphabetic";

    // Các trường động trên nền 1.png.
    receiptCtx.textAlign = "center";
    receiptCtx.fillStyle = "#ffffff";
    fitText(receiptCtx, formatMoney(state.amount), 620, 52, 400);
    receiptCtx.fillText(formatMoney(state.amount), w / 2, 600);

    const name = (recipient.name || "NGƯỜI NHẬN").toUpperCase();
    receiptCtx.fillStyle = "#a23ed8";
    fitText(receiptCtx, name, 620, 28, 650, 18);
    receiptCtx.fillText(name, w / 2, 680);

    // Hàng ngân hàng nằm gọn phía trên hai nhãn có sẵn trong ảnh nền.
    drawBankLogo(receiptCtx, recipient.bank, 239, 725, officialBankLogo);
    receiptCtx.textAlign = "left";
    receiptCtx.fillStyle = "#ffffff";
    const bankCode = recipient.bank.code.toUpperCase();
    const bankTextX = 273;
    fitText(receiptCtx, bankCode, 175, 26, 700, 15);
    receiptCtx.fillText(bankCode, bankTextX, 735);

    // Tên ngân hàng có độ dài khác nhau; đặt vạch ngăn theo chiều rộng thực tế.
    const bankTextWidth = receiptCtx.measureText(bankCode).width;
    const dividerX = Math.min(470, Math.max(427, bankTextX + bankTextWidth + 18));

    receiptCtx.strokeStyle = "rgba(178, 146, 194, .42)";
    receiptCtx.lineWidth = 2;
    receiptCtx.beginPath();
    receiptCtx.moveTo(dividerX, 707);
    receiptCtx.lineTo(dividerX, 744);
    receiptCtx.stroke();

    const formattedAccount = formatAccount(recipient.account);
    const accountTextX = dividerX + 24;
    receiptCtx.fillStyle = "#ffffff";
    fitText(receiptCtx, formattedAccount, 786 - accountTextX, 26, 450, 16);
    receiptCtx.fillText(formattedAccount, accountTextX, 735);

    receiptCtx.fillStyle = "#ffffff";
    receiptCtx.textAlign = "right";
    receiptCtx.font = "500 26px -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif";
    receiptCtx.fillText("Chuyen khoan qua QR", 786, 812);

    receiptCtx.textAlign = "right";
    receiptCtx.font = "600 25px -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif";
    receiptCtx.fillText(stamp.full, 786, 872);

    // Nhãn chống nhầm lẫn với biên lai thật.
    // receiptCtx.save();
    // receiptCtx.globalAlpha = .82;
    // receiptCtx.fillStyle = "#6c258e";
    // receiptCtx.roundRect(286, 108, 280, 50, 25);
    // receiptCtx.fill();
    // receiptCtx.fillStyle = "#ffffff";
    // receiptCtx.textAlign = "center";
    // receiptCtx.font = "750 22px -apple-system, BlinkMacSystemFont, 'SF Pro Text', Arial, sans-serif";
    // receiptCtx.fillText("BẢN DEMO • MÔ PHỎNG", 426, 141);
    // receiptCtx.restore();
  }

  $("#startCamera").on("click", function () {
    if (state.scanning) {
      stopCamera();
      setStatus("Đã dừng camera");
    } else {
      startCamera();
    }
  });

  $("#qrFile").on("change", function () {
    const file = this.files && this.files[0];
    if (!file) return;
    setStatus("Đang đọc ảnh đã chọn…");
    loadQrImage(URL.createObjectURL(file), true);
    this.value = "";
  });

  $("#amount").on("input", function () {
    const formatted = formatAmountInput(this.value);
    this.value = formatted;
    const amount = Number(digitsOnly(formatted));
    const valid = Number.isSafeInteger(amount) && amount > 0;
    $("#confirmTransfer").prop("disabled", !valid);
    $("#amountHint").text(valid ? `${amount.toLocaleString("vi-VN")} đồng` : "Nhập số tiền lớn hơn 0").removeClass("error");
  });

  $(".quick-amounts button").on("click", function () {
    $("#amount").val(formatAmountInput($(this).data("amount"))).trigger("input");
  });

  $("#manualRecipientName").on("input", function () {
    if (!state.recipient) return;
    const name = String(this.value || "").replace(/\s+/g, " ").trim();
    state.recipient.name = name;
    $("#recipientName").text(name || "CHƯA CÓ TÊN NGƯỜI NHẬN");
  });

  $("#amountForm").on("submit", async function (event) {
    event.preventDefault();
    const amount = Number(digitsOnly($("#amount").val()));
    if (!state.recipient || !Number.isSafeInteger(amount) || amount <= 0) {
      $("#amountHint").text("Số tiền không hợp lệ").addClass("error");
      return;
    }
    state.amount = amount;
    state.receiptTime = new Date();
    await renderReceipt();
    showScreen("#receiptScreen");
  });

  $("#downloadReceipt").on("click", function () {
    const link = document.createElement("a");
    link.download = `bien-lai-demo-${Date.now()}.png`;
    link.href = receiptCanvas.toDataURL("image/png");
    link.click();
  });

  $("#backToScan, #newTransfer").on("click", function () {
    stopCamera();
    state.recipient = null;
    state.amount = 0;
    state.receiptTime = null;
    $("#amount").val("");
    $("#confirmTransfer").prop("disabled", true);
    $("#amountHint").text("Nhập số tiền lớn hơn 0").removeClass("error");
    setStatus("Sẵn sàng quét mã QR");
    showScreen("#scanScreen");
  });

  window.addEventListener("pagehide", stopCamera);
})(jQuery);
