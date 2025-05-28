$(function () {
    var $body = $('body');
    var $frames = $('#frames');
    var $hexInput = $('#hex-input');
    var $insertButton = $('#insert-button');
    var $deleteButton = $('#delete-button');
    var $updateButton = $('#update-button');
    var $numColsMatrix = $('#num-cols-matrix');
    var $numRowsMatrix = $('#num-rows-matrix');
    var $applyMatrixSizeButton = $('#apply-matrix-size');
    var $hexInputApplyButton = $('#hex-input-apply');

    var $outputFormatByte = $('#output-format-byte');
    var $outputFormatHex = $('#output-format-hex');

    var $leds, $colsGlobal, $rowsGlobal;

    var NUM_COLS_MATRIX = parseInt($numColsMatrix.val());
    var NUM_ROWS_MATRIX = parseInt($numRowsMatrix.val());

    var TOTAL_PIXEL_COLS = NUM_COLS_MATRIX * 8;
    var TOTAL_PIXEL_ROWS = NUM_ROWS_MATRIX * 8;

    // Helper function for mapping global (x,y) to (module_idx, module_x, module_y)
    function getModuleCoords(globalX, globalY) {
        if (globalX < 0 || globalX >= TOTAL_PIXEL_COLS || globalY < 0 || globalY >= TOTAL_PIXEL_ROWS) {
            return null; // Out of bounds
        }

        var moduleCol = Math.floor(globalX / 8);
        var moduleRow = Math.floor(globalY / 8);
        var moduleIndex = moduleRow * NUM_COLS_MATRIX + moduleCol;

        var localX = globalX % 8;
        var localY = globalY % 8;

        return {
            moduleIndex: moduleIndex,
            localX: localX,
            localY: localY
        };
    }

    var generator = {
        tableCols: function (totalCols) {
            var out = ['<table id="cols-list-global"><tr>'];
            for (var i = 1; i <= totalCols; i++) {
                out.push('<td class="item" data-col="' + i + '">' + i + '</td>');
            }
            out.push('</tr></table>');
            return out.join('');
        },
        tableRows: function (totalRows) {
            var out = ['<table id="rows-list-global">'];
            for (var i = 1; i <= totalRows; i++) {
                out.push('<tr><td class="item" data-row="' + i + '">' + i + '</td></tr>');
            }
            out.push('</table>');
            return out.join('');
        },
        tableLeds: function (totalRows, totalCols) {
            var out = ['<table id="leds-matrix">'];
            for (var i = 1; i <= totalRows; i++) {
                out.push('<tr>');
                for (var j = 1; j <= totalCols; j++) {
                    var moduleCoords = getModuleCoords(j - 1, i - 1);
                    out.push('<td class="item" data-row="' + i + '" data-col="' + j + '" data-module-idx="' + (moduleCoords ? moduleCoords.moduleIndex : '') + '"></td>');
                }
                out.push('</tr>');
            }
            out.push('</table>');
            return out.join('');
        }
    };

    var converter = {
        patternToFrame: function (fullPattern) {
            var patterns = fullPattern.split('|');
            var out = ['<div class="frame-container" data-hex="' + fullPattern + '">'];

            out.push('<table class="frame-grid">');
            for (var r = 0; r < NUM_ROWS_MATRIX; r++) {
                out.push('<tr>');
                for (var c = 0; c < NUM_COLS_MATRIX; c++) {
                    var moduleIndex = r * NUM_COLS_MATRIX + c;
                    var pattern = patterns[moduleIndex] || '0000000000000000';
                    out.push('<td class="sub-frame-cell">');
                    out.push(converter.subPatternTo8x8Frame(pattern));
                    out.push('</td>');
                }
                out.push('</tr>');
            }
            out.push('</table>');
            out.push('</div>');
            return out.join('');
        },
        subPatternTo8x8Frame: function (pattern) {
            var out = ['<table class="frame sub-frame" data-hex="' + pattern + '">'];
            for (var i = 0; i < 8; i++) { // 0-7 로우
                var byte = pattern.substr((7 - i) * 2, 2); // pattern의 16진수 문자열이 "Col7Col6...Col0" 순서이므로, Col0(가장 오른쪽 바이트)부터 읽으려면 인덱스 계산을 반대로 해야 함.
                                                            // 예: Col0의 2글자는 (16-2)=14 인덱스부터, Col1은 (16-4)=12 인덱스부터. (14 - i*2)
                byte = parseInt(byte, 16);

                out.push('<tr>');
                for (var j = 0; j < 8; j++) { // 0-7 컬럼
                    if ((byte & (1 << j))) { // LSB (y=0) first
                        out.push('<td class="item active"></td>');
                    } else {
                        out.push('<td class="item"></td>');
                    }
                }
                out.push('</tr>');
            }
            out.push('</table>');
            return out.join('');
        },

        patternsToCodeCppByteArray: function (allFramesPatterns) {
            var numModules = NUM_COLS_MATRIX * NUM_ROWS_MATRIX;
            var out = ['const byte IMAGES[' + allFramesPatterns.length + '][' + (numModules * 8) + '] = {\n'];

            for (var i = 0; i < allFramesPatterns.length; i++) {
                var currentFrameHex = allFramesPatterns[i];
                var modulePatterns = currentFrameHex.split('|');

                out.push('  {');
                for (var m = 0; m < numModules; m++) {
                    var pattern = modulePatterns[m] || '0000000000000000';

                    // C++ Byte Array는 보통 컬럼별 바이트 (8바이트)를 순서대로 나열하므로
                    // 16진수 패턴에서 각 컬럼의 바이트를 추출하여 추가
                    for (var j = 0; j < 8; j++) { // j=0 -> Col7, j=1 -> Col6, ... j=7 -> Col0
                        var byteStr = pattern.substr(j * 2, 2);
                        var byteVal = parseInt(byteStr, 16);
                        out.push('0x' + ('00' + byteVal.toString(16)).slice(-2).toUpperCase());
                        if (!(m === numModules - 1 && j === 7)) {
                            out.push(', ');
                        }
                    }
                    if (m < numModules - 1) {
                        out.push(' ');
                    }
                }
                out.push('}');
                if (i < allFramesPatterns.length - 1) {
                    out.push(',\n');
                } else {
                    out.push('\n');
                }
            }
            out.push('};\n');
            out.push('const int IMAGES_LEN = sizeof(IMAGES)/sizeof(IMAGES[0]);\n');
            out.push('const int NUM_COLS_MATRIX = ' + NUM_COLS_MATRIX + ';\n');
            out.push('const int NUM_ROWS_MATRIX = ' + NUM_ROWS_MATRIX + ';\n');
            return out.join('');
        },

        patternsToCodeCppHexArray: function (allFramesPatterns) {
            var out = ['const char* IMAGES_HEX[' + allFramesPatterns.length + '] = {\n'];
            for (var i = 0; i < allFramesPatterns.length; i++) {
                var currentFrameHex = allFramesPatterns[i];
                out.push('  "' + currentFrameHex.toUpperCase() + '"');
                if (i < allFramesPatterns.length - 1) {
                    out.push(',\n');
                } else {
                    out.push('\n');
                }
            }
            out.push('};\n');
            out.push('const int IMAGES_LEN = sizeof(IMAGES_HEX)/sizeof(IMAGES_HEX[0]);\n');
            out.push('const int NUM_COLS_MATRIX = ' + NUM_COLS_MATRIX + ';\n');
            out.push('const int NUM_ROWS_MATRIX = ' + NUM_ROWS_MATRIX + ';\n');
            return out.join('');
        },

        patternsToCodeJSByteArray: function (allFramesPatterns) {
            var numModules = NUM_COLS_MATRIX * NUM_ROWS_MATRIX;
            var out = ['var pictures = [\n'];

            for (var i = 0; i < allFramesPatterns.length; i++) {
                var currentFrameHex = allFramesPatterns[i];
                var modulePatterns = currentFrameHex.split('|');

                out.push('  [');
                for (var m = 0; m < numModules; m++) {
                    var pattern = modulePatterns[m] || '0000000000000000';
                    for (var j = 0; j < 8; j++) {
                        var byteStr = pattern.substr(j * 2, 2);
                        var byteVal = parseInt(byteStr, 16);
                        out.push('0x' + ('00' + byteVal.toString(16)).slice(-2).toUpperCase());
                        if (!(m === numModules - 1 && j === 7)) {
                            out.push(', ');
                        }
                    }
                    if (m < numModules - 1) {
                        out.push(' ');
                    }
                }
                out.push(']');
                if (i < allFramesPatterns.length - 1) {
                    out.push(',\n');
                } else {
                    out.push('\n');
                }
            }
            out.push('];\n');
            out.push('var NUM_COLS_MATRIX = ' + NUM_COLS_MATRIX + ';\n');
            out.push('var NUM_ROWS_MATRIX = ' + NUM_ROWS_MATRIX + ';\n');
            return out.join('');
        },

        patternsToCodeJSHexArray: function (allFramesPatterns) {
            var out = ['var pictures = [\n'];
            for (var i = 0; i < allFramesPatterns.length; i++) {
                var currentFrameHex = allFramesPatterns[i];
                out.push('  "' + currentFrameHex.toUpperCase() + '"');
                if (i < allFramesPatterns.length - 1) {
                    out.push(',\n');
                } else {
                    out.push('\n');
                }
            }
            out.push('];\n');
            out.push('var NUM_COLS_MATRIX = ' + NUM_COLS_MATRIX + ';\n');
            out.push('var NUM_ROWS_MATRIX = ' + NUM_ROWS_MATRIX + ';\n');
            return out.join('');
        },

        fixPattern: function (pattern) {
            var numModules = NUM_COLS_MATRIX * NUM_ROWS_MATRIX;
            pattern = pattern.replace(/[^0-9a-fA-F|]/g, '');

            var parts = pattern.split('|');
            var fixedParts = [];
            for (var i = 0; i < numModules; i++) {
                var p = parts[i] || '';
                p = p.replace(/[^0-9a-fA-F]/g, '');
                fixedParts.push(('0000000000000000' + p).substr(-16));
            }
            return fixedParts.join('|');
        },
        fixPatterns: function (patterns) {
            for (var i = 0; i < patterns.length; i++) {
                patterns[i] = converter.fixPattern(patterns[i]);
            }
            return patterns;
        }
    };

    function makeFrameElement(fullPattern) {
        fullPattern = converter.fixPattern(fullPattern);
        var $frame = $(converter.patternToFrame(fullPattern));
        $frame.click(onFrameClick); // 이벤트 핸들러를 여기서 바인딩
        return $frame;
    }

    function ledsToHex() {
        var numModules = NUM_COLS_MATRIX * NUM_ROWS_MATRIX;
        var moduleHexPatterns = Array(numModules).fill('0000000000000000');

        for (var r = 0; r < TOTAL_PIXEL_ROWS; r++) {
            for (var c = 0; c < TOTAL_PIXEL_COLS; c++) {
                var $led = $leds.find('.item[data-row=' + (r + 1) + '][data-col=' + (c + 1) + ']');
                if ($led.hasClass('active')) {
                    var moduleCoords = getModuleCoords(c, r);
                    if (moduleCoords) {
                        var moduleIndex = moduleCoords.moduleIndex;
                        var localX = moduleCoords.localX; // 모듈 내의 X (0-7)
                        var localY = moduleCoords.localY; // 모듈 내의 Y (0-7)

                        var currentModulePattern = moduleHexPatterns[moduleIndex];
                        // 패턴은 "Col7Col6...Col0" 순서의 16진수 문자열
                        // localX는 0-7, 0이 가장 오른쪽 컬럼 (Col0)
                        // 따라서 (7 - localX) * 2 로 인덱스를 계산해야 올바른 컬럼 바이트에 접근
                        var byteCharIndex = (7 - localX) * 2; // Col7에 해당하는 2글자가 인덱스 0,1 / Col0에 해당하는 2글자가 인덱스 14,15
                        
                        var currentByte = parseInt(currentModulePattern.substr(byteCharIndex, 2), 16);
                        
                        currentByte |= (1 << localY); // localY 위치의 비트를 1로 설정

                        moduleHexPatterns[moduleIndex] = currentModulePattern.substr(0, byteCharIndex) +
                                                          ('00' + currentByte.toString(16)).slice(-2).toUpperCase() +
                                                          currentModulePattern.substr(byteCharIndex + 2);
                    }
                }
            }
        }
        $hexInput.val(moduleHexPatterns.join('|'));
        // NOTE: ledsToHex()는 단지 현재 LED 상태를 HEX 입력 필드에 반영하고 반환하는 역할만 합니다.
        // saveState()는 별도로 필요한 시점에 호출합니다.
        return moduleHexPatterns.join('|'); // 현재 HEX 값 반환
    }

    function hexInputToLeds() {
        $leds.find('.item').removeClass('active');

        var fullPattern = getInputHexValue();
        var modulePatterns = fullPattern.split('|');

        for (var m = 0; m < modulePatterns.length; m++) {
            var modulePattern = modulePatterns[m];
            if (!modulePattern) continue;

            var moduleRow = Math.floor(m / NUM_COLS_MATRIX);
            var moduleCol = m % NUM_COLS_MATRIX;
            var startGlobalX = moduleCol * 8; // 시작 전역 X (모듈의 첫 컬럼)
            var startGlobalY = moduleRow * 8; // 시작 전역 Y (모듈의 첫 로우)

            // hex 패턴이 Col7Col6...Col0 순서이므로, Col0부터 처리하려면 14- (i*2) 인덱스
            for (var i = 0; i < 8; i++) { // i는 local column index (0-7)
                var byte = parseInt(modulePattern.substr((7 - i) * 2, 2), 16); // pattern.substr(14,2)는 col0, pattern.substr(0,2)는 col7
                
                for (var j = 0; j < 8; j++) { // j는 local row index (0-7)
                    if ((byte & (1 << j))) { // LSB (y=0) 부터 확인
                        var globalX = startGlobalX + i; // i가 localX 역할 (컬럼 인덱스)
                        var globalY = startGlobalY + j; // j가 localY 역할 (로우 인덱스)
                        $leds.find('.item[data-row=' + (globalY + 1) + '][data-col=' + (globalX + 1) + ']').addClass('active');
                    }
                }
            }
        }
    }


    var savedHashState;

    function printCode(patterns) {
        if (patterns.length) {
            var code;
            var outputLanguage = $('input[name="output_lang"]:checked').val();
            var outputFormatType = $('input[name="output_format_type"]:checked').val();

            if (outputLanguage === "arduino") {
                if (outputFormatType === "byte") {
                    code = converter.patternsToCodeCppByteArray(patterns);
                } else { // hex
                    code = converter.patternsToCodeCppHexArray(patterns);
                }
            } else if (outputLanguage === "javascript") {
                if (outputFormatType === "byte") {
                    code = converter.patternsToCodeJSByteArray(patterns);
                } else { // hex
                    code = converter.patternsToCodeJSHexArray(patterns);
                }
            }
            // 유니코드 공백문자 및 BOM 제거
            if (code) {
                // 제어 문자(C0, C1) 및 BOM (U+FEFF) 제거
                code = code.replace(/[\u0000-\u001F\u007F-\u009F\uFEFF]/g, '');
                // 폰트 파일 등에 사용되는 널 문자 제거 (추가적으로)
                code = code.replace(/\0/g, '');
                // 콤마 뒤의 유니코드 공백 (예: U+200B Zero Width Space) 제거
                code = code.replace(/,\s*([\u200B\u200C\u200D\u2060\uFEFF])+/g, ',');
            }
            $('#output').val(code);
            hljs.highlightElement($('#output')[0]);
        } else {
            $('#output').val(''); // 프레임이 없으면 출력창 비우기
            hljs.highlightElement($('#output')[0]); // 하이라이트 새로고침
        }
    }

    function framesToPatterns() {
        var out = [];
        $frames.find('.frame-container').each(function () {
            out.push($(this).attr('data-hex'));
        });
        return out;
    }

    function saveState() {
        var patterns = framesToPatterns();
        printCode(patterns);
        window.location.hash = savedHashState = patterns.join(';');
    }

    function loadState() {
        savedHashState = window.location.hash.slice(1);
        $frames.empty();
        var frame;
        var patterns = savedHashState.split(';');

        // 프레임이 없거나 빈 문자열만 있는 경우 빈 프레임 추가
        if (patterns.length === 1 && patterns[0] === '') {
            patterns = []; // 빈 패턴 배열로 초기화
        }

        // URL 해시가 비어있으면 초기 빈 프레임 생성
        if (patterns.length === 0) {
            insertNewEmptyFrame();
            // insertNewEmptyFrame()이 이미 클릭 이벤트 핸들러를 바인딩하므로 다시 makeFrameElement로 감쌀 필요 없음
            var $firstFrame = $frames.find('.frame-container').first();
            processToSave($firstFrame); // 새 프레임 선택 및 상태 저장
            hexInputToLeds(); // LED 매트릭스 업데이트
            return;
        }

        patterns = converter.fixPatterns(patterns);

        for (var i = 0; i < patterns.length; i++) {
            frame = makeFrameElement(patterns[i]);
            $frames.append(frame);
        }
        var $firstFrame = $frames.find('.frame-container').first();
        if ($firstFrame.length) {
            processToSave($firstFrame); // 첫 프레임 선택 및 상태 저장
            hexInputToLeds(); // 선택된 프레임을 LED 매트릭스에 그리기
        }
    }

    function getInputHexValue() {
        return converter.fixPattern($hexInput.val());
    }

    // 애니메이션 프레임 클릭 이벤트 핸들러
    function onFrameClick() {
        var $clickedFrameContainer = $(this);
        $hexInput.val($clickedFrameContainer.attr('data-hex')); // HEX 입력 필드 업데이트
        processToSave($clickedFrameContainer); // 선택 상태 변경 및 상태 저장
        hexInputToLeds(); // **선택된 프레임의 패턴을 주 매트릭스에 반영**
    }

    function processToSave($focusToFrame) {
        $frames.find('.frame-container.selected').removeClass('selected');

        if ($focusToFrame.length) {
            $focusToFrame.addClass('selected');
            $deleteButton.removeAttr('disabled');
            $updateButton.removeAttr('disabled');
            // 프레임 선택 시 HEX 입력 필드에 값 반영
            $hexInput.val($focusToFrame.attr('data-hex'));
        } else {
            $deleteButton.attr('disabled', 'disabled');
            $updateButton.attr('disabled', 'disabled');
            $hexInput.val(''); // 선택된 프레임이 없으면 HEX 입력 필드 비우기
        }
        saveState(); // 프레임 선택/변경 시 코드 업데이트 및 URL 해시 저장
    }

    function drawMatrixUI() {
        TOTAL_PIXEL_COLS = NUM_COLS_MATRIX * 8;
        TOTAL_PIXEL_ROWS = NUM_ROWS_MATRIX * 8;

        $('#cols-container-global').empty().append($(generator.tableCols(TOTAL_PIXEL_COLS)));
        $('#rows-container-global').empty().append($(generator.tableRows(TOTAL_PIXEL_ROWS)));
        $('#leds-container').empty().append($(generator.tableLeds(TOTAL_PIXEL_ROWS, TOTAL_PIXEL_COLS)));

        $colsGlobal = $('#cols-list-global');
        $rowsGlobal = $('#rows-list-global');
        $leds = $('#leds-matrix');

        // 기존 .off('mousedown') 제거 (불필요한 중복 방지)
        $colsGlobal.find('.item').mousedown(function () {
            var col = parseInt($(this).attr('data-col'));
            var allActiveInCol = true;
            for (var r = 1; r <= TOTAL_PIXEL_ROWS; r++) {
                if (!$leds.find('.item[data-row=' + r + '][data-col=' + col + ']').hasClass('active')) {
                    allActiveInCol = false;
                    break;
                }
            }
            $leds.find('.item[data-col=' + col + ']').toggleClass('active', !allActiveInCol);
            ledsToHex(); // LED 상태 변경 시 HEX 업데이트
            saveState(); // 상태 변경 시 저장
        });

        $rowsGlobal.find('.item').mousedown(function () {
            var row = parseInt($(this).attr('data-row'));
            var allActiveInRow = true;
            for (var c = 1; c <= TOTAL_PIXEL_COLS; c++) {
                if (!$leds.find('.item[data-row=' + row + '][data-col=' + c + ']').hasClass('active')) {
                    allActiveInRow = false;
                    break;
                }
            }
            $leds.find('.item[data-row=' + row + ']').toggleClass('active', !allActiveInRow);
            ledsToHex(); // LED 상태 변경 시 HEX 업데이트
            saveState(); // 상태 변경 시 저장
        });

        $leds.find('.item').mousedown(function () {
            $(this).toggleClass('active');
            ledsToHex(); // LED 클릭 시에도 즉시 HEX 업데이트
            saveState(); // 상태 변경 시 저장
        });

        hexInputToLeds(); // UI 로드/재구성 시 HEX 값을 LED에 반영
        // saveState(); // drawMatrixUI에서 saveState를 호출할 필요 없음. loadState에서 이미 처리.
    }

    $numColsMatrix.on('change', function () {
        NUM_COLS_MATRIX = parseInt($(this).val());
    });
    $numRowsMatrix.on('change', function () {
        NUM_ROWS_MATRIX = parseInt($(this).val());
    });

    $applyMatrixSizeButton.click(function () {
        drawMatrixUI();
        // 매트릭스 크기 변경 시, 현재 편집 매트릭스 상태를 바탕으로 빈 프레임을 업데이트
        // 또는 기존 프레임이 있다면 해당 프레임의 크기도 반영되도록 조정 필요
        // 여기서는 일단 빈 프레임을 생성하고 현재 매트릭스를 그립니다.
        var $selectedFrame = $frames.find('.frame-container.selected').first();
        if ($selectedFrame.length) {
            // 현재 선택된 프레임이 있다면 그 패턴을 새 매트릭스에 적용
            var currentHex = $selectedFrame.attr('data-hex');
            // 새 매트릭스 크기에 맞게 패턴을 재조정 (모듈 개수 변경 시 중요)
            var newPaddedHex = converter.fixPattern(currentHex); // 새 N, M에 맞게 패턴 길이 조절
            $hexInput.val(newPaddedHex);
            hexInputToLeds();
            $selectedFrame.attr('data-hex', newPaddedHex); // data-hex도 업데이트
            // UI의 프레임 미리보기도 업데이트
            $selectedFrame.replaceWith(makeFrameElement(newPaddedHex));
            // 교체된 새 프레임을 다시 선택된 상태로 만듦
            processToSave($frames.find('.frame-container[data-hex="' + newPaddedHex + '"]').first());

        } else {
            // 선택된 프레임이 없다면 (초기 상태이거나 모두 삭제된 경우)
            // 현재 편집 매트릭스의 빈 상태를 기본 프레임으로 삽입
            var $newFrame = insertNewEmptyFrame();
            processToSave($newFrame);
            hexInputToLeds(); // 새 빈 프레임을 에디터에 반영
        }
        saveState(); // 변경된 상태 저장
    });

    $hexInputApplyButton.click(function () {
        var newHexValue = getInputHexValue();
        $hexInput.val(newHexValue); // 입력된 HEX 값 정규화하여 다시 필드에 표시
        hexInputToLeds(); // HEX 값에 따라 LED 매트릭스 업데이트
        var $selectedFrame = $frames.find('.frame-container.selected').first();
        if ($selectedFrame.length) {
            $selectedFrame.attr('data-hex', newHexValue);
            // 기존 프레임을 제거하고 새로운 프레임으로 교체 (UI 업데이트)
            $selectedFrame.replaceWith(makeFrameElement(newHexValue));
            // 교체된 새 프레임을 다시 선택된 상태로 만듦
            processToSave($frames.find('.frame-container[data-hex="' + newHexValue + '"]').first());
        }
        saveState(); // HEX 입력 적용 후 상태 저장
    });

    function insertNewEmptyFrame() {
        var numModules = NUM_COLS_MATRIX * NUM_ROWS_MATRIX;
        var emptyPattern = Array(numModules).fill('0000000000000000').join('|');
        var $newFrame = makeFrameElement(emptyPattern);
        $frames.append($newFrame);
        return $newFrame;
    }

    $('#invert-button').click(function () { // off('click') 제거
        $leds.find('.item').toggleClass('active');
        ledsToHex();
        saveState(); // 상태 변경 시 저장
    });

    $('#shift-up-button').click(function () { // off('click') 제거
        var currentFullPattern = getInputHexValue();
        var modulePatterns = currentFullPattern.split('|');
        var newModulePatterns = Array(modulePatterns.length).fill('');

        for (var m = 0; m < modulePatterns.length; m++) {
            var pattern = modulePatterns[m];
            var bytes = [];
            // 현재 패턴은 Col7Col6...Col0 순서
            for (var j = 0; j < 8; j++) { // j=0 -> Col7, j=1 -> Col6, ... j=7 -> Col0
                bytes.push(parseInt(pattern.substr(j * 2, 2), 16));
            }

            var newBytes = Array(8).fill(0);
            for (var b = 0; b < 8; b++) { // 각 컬럼 바이트를 위로 한 칸 시프트 (비트를 왼쪽으로 시프트)
                newBytes[b] = (bytes[b] << 1) & 0xFF;
            }
            // 원래 Col7Col6...Col0 순서로 다시 조합 (pattern.substr(j*2,2)와 동일하게)
            newModulePatterns[m] = newBytes.map(b => ('00' + b.toString(16)).substr(-2).toUpperCase()).join('');
        }
        $hexInput.val(newModulePatterns.join('|'));
        hexInputToLeds();
        saveState(); // 상태 변경 시 저장
    });

    $('#shift-down-button').click(function () { // off('click') 제거
        var currentFullPattern = getInputHexValue();
        var modulePatterns = currentFullPattern.split('|');
        var newModulePatterns = Array(modulePatterns.length).fill('');

        for (var m = 0; m < modulePatterns.length; m++) {
            var pattern = modulePatterns[m];
            var bytes = [];
            for (var j = 0; j < 8; j++) {
                bytes.push(parseInt(pattern.substr(j * 2, 2), 16));
            }

            var newBytes = Array(8).fill(0);
            for (var b = 0; b < 8; b++) {
                newBytes[b] = bytes[b] >> 1; // 비트를 오른쪽으로 시프트
            }
            newModulePatterns[m] = newBytes.map(b => ('00' + b.toString(16)).substr(-2).toUpperCase()).join('');
        }
        $hexInput.val(newModulePatterns.join('|'));
        hexInputToLeds();
        saveState(); // 상태 변경 시 저장
    });

    $('#shift-right-button').click(function () { // off('click') 제거
        var currentFullPattern = getInputHexValue();
        var modulePatterns = currentFullPattern.split('|');
        var newModulePatterns = Array(modulePatterns.length).fill('');

        for (var m = 0; m < modulePatterns.length; m++) {
            var pattern = modulePatterns[m];
            
            // 모듈의 8x8 LED 상태를 읽어서 2차원 배열로 변환
            var currentModuleLeds = [];
            for (var c = 0; c < 8; c++) { // 0-7 컬럼
                var byte = parseInt(pattern.substr((7 - c) * 2, 2), 16); // pattern은 Col7...Col0 순이므로 역순으로 바이트 가져오기
                currentModuleLeds[c] = [];
                for (var r = 0; r < 8; r++) { // 0-7 로우
                    currentModuleLeds[c][r] = !!(byte & (1 << r));
                }
            }

            var shiftedLeds = [];
            for (var c = 0; c < 8; c++) { // 새 컬럼
                shiftedLeds[c] = [];
                for (var r = 0; r < 8; r++) { // 새 로우
                    if (c === 0) { // 가장 왼쪽 컬럼은 0으로 채움
                        shiftedLeds[c][r] = false;
                    } else { // 이전 컬럼의 값을 가져옴
                        shiftedLeds[c][r] = currentModuleLeds[c - 1][r];
                    }
                }
            }

            // 시프트된 LED 배열을 다시 HEX 패턴으로 변환
            var out = [];
            for (var c = 0; c < 8; c++) { // Col0부터 Col7까지
                var newByte = 0;
                for (var r = 0; r < 8; r++) {
                    if (shiftedLeds[c][r]) {
                        newByte |= (1 << r);
                    }
                }
                out.push(('00' + newByte.toString(16)).substr(-2).toUpperCase());
            }
            // patternToFrame의 subPatternTo8x8Frame이 "Col7Col6...Col0" 순서로 바이트를 기대하므로
            // 여기서는 out을 뒤집지 않고 그대로 사용 (이미 Col0부터 out에 추가했기 때문)
            newModulePatterns[m] = out.join(''); // Col0...Col7 순서로 조립
        }
        $hexInput.val(newModulePatterns.join('|'));
        hexInputToLeds();
        saveState(); // 상태 변경 시 저장
    });


    $('#shift-left-button').click(function () { // off('click') 제거
        var currentFullPattern = getInputHexValue();
        var modulePatterns = currentFullPattern.split('|');
        var newModulePatterns = Array(modulePatterns.length).fill('');

        for (var m = 0; m < modulePatterns.length; m++) {
            var pattern = modulePatterns[m];
            
            // 모듈의 8x8 LED 상태를 읽어서 2차원 배열로 변환
            var currentModuleLeds = [];
            for (var c = 0; c < 8; c++) { // 0-7 컬럼
                var byte = parseInt(pattern.substr((7 - c) * 2, 2), 16); // pattern은 Col7...Col0 순이므로 역순으로 바이트 가져오기
                currentModuleLeds[c] = [];
                for (var r = 0; r < 8; r++) { // 0-7 로우
                    currentModuleLeds[c][r] = !!(byte & (1 << r));
                }
            }

            var shiftedLeds = [];
            for (var c = 0; c < 8; c++) { // 새 컬럼
                shiftedLeds[c] = [];
                for (var r = 0; r < 8; r++) { // 새 로우
                    if (c === 7) { // 가장 오른쪽 컬럼은 0으로 채움
                        shiftedLeds[c][r] = false;
                    } else { // 다음 컬럼의 값을 가져옴
                        shiftedLeds[c][r] = currentModuleLeds[c + 1][r];
                    }
                }
            }

            // 시프트된 LED 배열을 다시 HEX 패턴으로 변환
            var out = [];
            for (var c = 0; c < 8; c++) { // Col0부터 Col7까지
                var newByte = 0;
                for (var r = 0; r < 8; r++) {
                    if (shiftedLeds[c][r]) {
                        newByte |= (1 << r);
                    }
                }
                out.push(('00' + newByte.toString(16)).substr(-2).toUpperCase());
            }
            newModulePatterns[m] = out.join(''); // Col0...Col7 순서로 조립
        }
        $hexInput.val(newModulePatterns.join('|'));
        hexInputToLeds();
        saveState(); // 상태 변경 시 저장
    });


    $hexInput.keyup(function (event) { // off('keyup') 제거
        if (event.keyCode === 13) { // Enter key
            $hexInputApplyButton.click();
        }
    });

    $deleteButton.click(function () { // off('click') 제거
        var $selectedFrame = $frames.find('.frame-container.selected').first();
        var $nextFrame = $selectedFrame.next('.frame-container').first();

        if (!$nextFrame.length) {
            $nextFrame = $selectedFrame.prev('.frame-container').first();
        }

        $selectedFrame.remove();

        if (!$frames.find('.frame-container').length) {
            insertNewEmptyFrame();
            $nextFrame = $frames.find('.frame-container').first(); // 새로 생성된 프레임
        }

        processToSave($nextFrame); // 삭제 후 새로운 프레임 선택 및 상태 저장
        hexInputToLeds(); // 새롭게 선택된 프레임을 LED 매트릭스에 그리기
    });

    $insertButton.click(function () { // off('click') 제거
        var $newFrame = makeFrameElement(getInputHexValue());
        var $selectedFrame = $frames.find('.frame-container.selected').first();

        if ($selectedFrame.length) {
            $selectedFrame.after($newFrame);
        } else {
            $frames.append($newFrame);
        }

        processToSave($newFrame);
        // hexInputToLeds(); // processToSave 내부에서 호출되므로 불필요
    });

    $updateButton.click(function () { // off('click') 제거
        var $selectedFrame = $frames.find('.frame-container.selected').first();
        if ($selectedFrame.length) {
            var currentHex = ledsToHex(); // 현재 LED 매트릭스 상태를 HEX로 변환하고 hexInput에도 업데이트
            
            $selectedFrame.attr('data-hex', currentHex); // 선택된 프레임의 data-hex 업데이트
            // 기존 프레임을 제거하고 새로운 프레임으로 교체 (UI 업데이트)
            // (makeFrameElement는 클릭 이벤트를 다시 바인딩하므로 이 방식이 안전합니다.)
            var $updatedFrameElement = makeFrameElement(currentHex);
            $selectedFrame.replaceWith($updatedFrameElement);
            
            processToSave($updatedFrameElement); // 업데이트된 새 프레임을 다시 선택된 상태로 만듦
        }
    });

    // 출력 언어 라디오 버튼 변경 시
    $('input[name="output_lang"]').change(function () { // off('change') 제거
        var patterns = framesToPatterns();
        printCode(patterns);
    });

    // 출력 형식 라디오 버튼 변경 시 (새로 추가)
    $('input[name="output_format_type"]').change(function () { // off('change') 제거
        var patterns = framesToPatterns();
        printCode(patterns);
    });

    $('#matrix-toggle').hover(function () { // off('hover') 제거
        $colsGlobal.find('.item').addClass('hover');
        $rowsGlobal.find('.item').addClass('hover');
    }, function () {
        $colsGlobal.find('.item').removeClass('hover');
        $rowsGlobal.find('.item').removeClass('hover');
    });

    $('#matrix-toggle').mousedown(function () { // off('mousedown') 제거
        var totalLeds = TOTAL_PIXEL_COLS * TOTAL_PIXEL_ROWS;
        $leds.find('.item').toggleClass('active', $leds.find('.item.active').length !== totalLeds);
        ledsToHex();
        saveState(); // 상태 변경 시 저장
    });

    $('#circuit-theme').click(function () { // off('click') 제거
        if ($body.hasClass('circuit-theme')) {
            $body.removeClass('circuit-theme');
            // Cookies.set('page-theme', 'plain-theme', {path: ''}); // 주석 처리된 상태 유지
        } else {
            $body.addClass('circuit-theme');
            // Cookies.set('page-theme', 'circuit-theme', {path: ''}); // 주석 처리된 상태 유지
        }
    });

    $('.leds-case').click(function () { // off('click') 제거
        var themeName = $(this).attr('data-leds-theme');
        setLedsTheme(themeName);
        // Cookies.set('leds-theme', themeName, {path: ''}); // 주석 처리된 상태 유지
    });

    function setLedsTheme(themeName) {
        $body.removeClass('red-leds yellow-leds green-leds blue-leds white-leds').addClass(themeName);
    }

    function setPageTheme(themeName) {
        $body.removeClass('plain-theme circuit-theme').addClass(themeName);
    }

    var playInterval;

    $('#play-button').click(function () { // off('click') 제거
        if (playInterval) {
            $('#play-button-stop').hide();
            $('#play-button-play').show();
            clearInterval(playInterval);
            playInterval = null;
        } else {
            $('#play-button-stop').show();
            $('#play-button-play').hide();

            var $allFrames = $frames.find('.frame-container');
            if ($allFrames.length === 0) {
                // 재생할 프레임이 없으면 재생 시작 안함
                $('#play-button-stop').hide();
                $('#play-button-play').show();
                return;
            }

            var currentIndex = $allFrames.index($frames.find('.frame-container.selected').first());
            if (currentIndex === -1) { // 선택된 프레임이 없으면 첫 프레임부터 시작
                currentIndex = 0;
            } else {
                currentIndex = (currentIndex + 1) % $allFrames.length; // 현재 선택된 다음 프레임부터 시작
            }

            playInterval = setInterval(function () {
                var $nextFrame = $allFrames.eq(currentIndex);

                if ($nextFrame.length) {
                    $hexInput.val($nextFrame.attr('data-hex'));
                }

                processToSave($nextFrame); // 프레임 전환 시 선택 상태 및 상태 저장
                hexInputToLeds(); // **애니메이션 프레임을 주 매트릭스에 반영**

                currentIndex = (currentIndex + 1) % $allFrames.length;
            }, $('#play-delay-input').val());
        }
    });

    $(window).on('hashchange', function () {
        if (window.location.hash.slice(1) !== savedHashState) {
            loadState();
        }
    });

    $frames.sortable({
        items: '.frame-container',
        stop: function (event, ui) {
            saveState();
        }
    });

    // 초기화 함수
    function initialize() {
        NUM_COLS_MATRIX = parseInt($numColsMatrix.val());
        NUM_ROWS_MATRIX = parseInt($numRowsMatrix.val());

        drawMatrixUI();
        loadState();

        // Cookies 관련 주석 처리된 코드 (원래 없으므로 그대로 유지)
        // var ledsTheme = Cookies.get('leds-theme');
        // if (ledsTheme) {
        //     setLedsTheme(ledsTheme);
        // }

        // var pageTheme = Cookies.get('page-theme') || 'circuit-theme';
        // setPageTheme(pageTheme);
    }

    initialize(); // 페이지 로드 시 초기화 함수 호출

});
