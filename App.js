import React, { useCallback, useState, useEffect } from "react";
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  PermissionsAndroid,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import RNFS from "react-native-fs";
import { unzip } from "react-native-zip-archive";
import Sound from "react-native-sound";
import { initWhisper, libVersion, AudioSessionIos } from "whisper.rn"; // whisper.rn
import contextOpts from "./context-opts";

const sampleFile = require("./assets/jfk.wav");

if (Platform.OS === "android") {
  // Request record audio permission
  // @ts-ignore
  PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: "Whisper Audio Permission",
    message: "Whisper needs access to your microphone",
    buttonNeutral: "Ask Me Later",
    buttonNegative: "Cancel",
    buttonPositive: "OK",
  });
}

const styles = StyleSheet.create({
  scrollview: { flexGrow: 1, justifyContent: "center" },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
  },
  buttons: { flexDirection: "row" },
  button: { margin: 4, backgroundColor: "#333", borderRadius: 4, padding: 8 },
  buttonClear: { backgroundColor: "#888" },
  buttonText: { fontSize: 14, color: "white", textAlign: "center" },
  logContainer: {
    backgroundColor: "lightgray",
    padding: 8,
    width: "95%",
    borderRadius: 8,
    marginVertical: 8,
  },
  logText: { fontSize: 12, color: "#333" },
  label: {
    fontSize: 16,
    marginBottom: 10,
  },
  picker: {
    width: 300,
    height: 44,
    backgroundColor: "#FFF",
    borderColor: "#000",
    borderWidth: 1,
  },
  selected: {
    marginTop: 20,
    fontSize: 16,
  },
  textInput: {
    height: 100, // Set the height appropriately
    width: "100%",
    borderColor: "gray",
    borderWidth: 1,
    textAlignVertical: "top", // This ensures text starts at the top of the textbox
    padding: 10,
  },
});

function toTimestamp(t, comma = false) {
  let msec = t * 10;
  const hr = Math.floor(msec / (1000 * 60 * 60));
  msec -= hr * (1000 * 60 * 60);
  const min = Math.floor(msec / (1000 * 60));
  msec -= min * (1000 * 60);
  const sec = Math.floor(msec / 1000);
  msec -= sec * 1000;

  const separator = comma ? "," : ".";
  const timestamp = `${String(hr).padStart(2, "0")}:${String(min).padStart(
    2,
    "0"
  )}:${String(sec).padStart(2, "0")}${separator}${String(msec).padStart(
    3,
    "0"
  )}`;

  return timestamp;
}

const mode = process.env.NODE_ENV === "development" ? "debug" : "release";

const fileDir = `${RNFS.DocumentDirectoryPath}/whisper`;

console.log("[App] fileDir", fileDir);

const recordFile = `${fileDir}/realtime.wav`;

const modelHost = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

const createDir = async (log) => {
  if (!(await RNFS.exists(fileDir))) {
    log("Create dir", fileDir);
    await RNFS.mkdir(fileDir);
  }
};

const filterPath = (path) =>
  path.replace(RNFS.DocumentDirectoryPath, "<DocumentDir>");

export default function App() {
  const [whisperContext, setWhisperContext] = useState(null);
  const [logs, setLogs] = useState([`whisper.cpp version: ${libVersion}`]);
  const [transcibeResult, setTranscibeResult] = useState(null);
  const [stopTranscribe, setStopTranscribe] = useState(null);
  const [selectedModel, setSelectedModel] = useState("ggml-base.bin");
  const [prompt, setPrompt] = useState("");

  const models = [
    { model: "ggml-tiny.bin", size: "77.7 MB" },
    { model: "ggml-tiny.en.bin", size: "77.7 MB" },
    { model: "ggml-tiny-q5_1.bin", size: "32.2 MB" },
    { model: "ggml-tiny.en-q5_1.bin", size: "32.2 MB" },
    { model: "ggml-tiny.en-q8_0.bin", size: "43.6 MB" },
    { model: "ggml-base.bin", size: "148 MB" },
    { model: "ggml-base-q5_1.bin", size: "59.7 MB" },
    { model: "ggml-base.en-q5_1.bin", size: "59.7 MB" },
    { model: "ggml-base.en.bin", size: "148 MB" },
    { model: "ggml-small-q5_1.bin", size: "190 MB" },
    { model: "ggml-small.en-q5_1.bin", size: "190 MB" },
    { model: "ggml-small.en.bin", size: "488 MB" },
    { model: "ggml-small.bin", size: "488 MB" },
    { model: "ggml-medium-q5_0.bin", size: "539 MB" },
    { model: "ggml-medium.en-q5_0.bin", size: "539 MB" },
    { model: "ggml-medium.bin", size: "1.53 GB" },
    { model: "ggml-medium.en.bin", size: "1.53 GB" },
  ];

  const log = useCallback((...messages) => {
    setLogs((prev) => [...prev, messages.join(" ")]);
  }, []);

  const progress = useCallback(
    ({ contentLength, bytesWritten }) => {
      const written = bytesWritten >= 0 ? bytesWritten : 0;
      log(`Download progress: ${Math.round((written / contentLength) * 100)}%`);
    },
    [log]
  );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.scrollview}
    >
      <SafeAreaView style={styles.container}>
        <TextInput
          style={styles.textInput}
          multiline
          numberOfLines={4} // You can adjust the number of lines
          onChangeText={(prompt) => setPrompt(prompt)}
          value={prompt}
          placeholder="Type something..."
        />
        <Text style={styles.label}>Select a Model:</Text>
        <Picker
          selectedValue={selectedModel}
          style={styles.picker}
          onValueChange={(itemValue, itemIndex) => setSelectedModel(itemValue)}
        >
          {models.map((item, index) => (
            <Picker.Item
              key={index}
              label={`${item.model} (${item.size})`}
              value={item.model}
            />
          ))}
        </Picker>
        <TouchableOpacity
          style={styles.button}
          onPress={async () => {
            if (whisperContext) {
              log("Found previous context");
              await whisperContext.release();
              setWhisperContext(null);
              log("Released previous context");
            }
            await createDir(log);
            const modelFilePath = `${fileDir}/${selectedModel}`;
            if (await RNFS.exists(modelFilePath)) {
              log("Model already exists:");
              log(filterPath(modelFilePath));
            } else {
              log("Start Download Model to:");
              log(filterPath(modelFilePath));
              await RNFS.downloadFile({
                fromUrl: `${modelHost}/${selectedModel}`,
                toFile: modelFilePath,
                progressInterval: 1000,
                begin: () => {},
                progress,
              }).promise;
              log("Downloaded model file:");
              log(filterPath(modelFilePath));
            }

            // If you don't want to enable Core ML, you can remove this
            // const coremlModelFilePath = `${fileDir}/ggml-tiny-encoder.mlmodelc.zip`;
            // if (
            //   Platform.OS === "ios" &&
            //   (await RNFS.exists(coremlModelFilePath))
            // ) {
            //   log("Core ML Model already exists:");
            //   log(filterPath(coremlModelFilePath));
            // } else if (Platform.OS === "ios") {
            //   log("Start Download Core ML Model to:");
            //   log(filterPath(coremlModelFilePath));
            //   await RNFS.downloadFile({
            //     fromUrl: `${modelHost}/ggml-tiny-encoder.mlmodelc.zip`,
            //     toFile: coremlModelFilePath,
            //     progressInterval: 1000,
            //     begin: () => {},
            //     progress,
            //   }).promise;
            //   log("Downloaded Core ML Model model file:");
            //   log(filterPath(modelFilePath));
            //   await unzip(coremlModelFilePath, fileDir);
            //   log("Unzipped Core ML Model model successfully.");
            // }

            log("Initialize context...");
            const startTime = Date.now();
            const ctx = await initWhisper({ filePath: modelFilePath });
            const endTime = Date.now();
            log("Loaded model, ID:", ctx.id);
            log("Loaded model in", endTime - startTime, `ms in ${mode} mode`);
            setWhisperContext(ctx);
          }}
        >
          <Text style={styles.buttonText}>
            {`Initialize(Download): ${selectedModel}`}
          </Text>
        </TouchableOpacity>

        <View style={styles.buttons}>
          <TouchableOpacity
            style={[
              styles.button,
              stopTranscribe?.stop ? styles.buttonClear : null,
            ]}
            onPress={async () => {
              if (!whisperContext) return log("No context");
              if (stopTranscribe?.stop) {
                const t0 = Date.now();
                await stopTranscribe?.stop();
                const t1 = Date.now();
                log("Stopped transcribing in", t1 - t0, "ms");
                setStopTranscribe(null);
                return;
              }
              log("Start realtime transcribing...");
              try {
                await createDir(log);
                const { stop, subscribe } =
                  await whisperContext.transcribeRealtime({
                    maxLen: 1,
                    language: "en",
                    // Enable beam search (may be slower than greedy but more accurate)
                    // beamSize: 2,
                    // Record duration in seconds
                    realtimeAudioSec: 60,
                    // Slice audio into 25 (or < 30) sec chunks for better performance
                    realtimeAudioSliceSec: 25,
                    // Save audio on stop
                    audioOutputPath: recordFile,
                    // iOS Audio Session
                    audioSessionOnStartIos: {
                      category: AudioSessionIos.Category.PlayAndRecord,
                      options: [
                        AudioSessionIos.CategoryOption.MixWithOthers,
                        AudioSessionIos.CategoryOption.AllowBluetooth,
                      ],
                      mode: AudioSessionIos.Mode.Default,
                    },
                    audioSessionOnStopIos: "restore", // Or an AudioSessionSettingIos
                    // Voice Activity Detection - Start transcribing when speech is detected
                    useVad: true,
                    prompt: prompt,
                  });
                setStopTranscribe({ stop });
                subscribe((evt) => {
                  const { isCapturing, data, processTime, recordingTime } = evt;
                  setTranscibeResult(
                    `Realtime transcribing: ${isCapturing ? "ON" : "OFF"}\n` +
                      `Prompt: ${prompt}\n\n` +
                      `Result: ${data?.result}\n\n` +
                      `Process time: ${processTime}ms\n` +
                      `Recording time: ${recordingTime}ms` +
                      `\n` +
                      `Segments:` +
                      `\n${data?.segments
                        .map(
                          (segment) =>
                            `[${toTimestamp(segment.t0)} --> ${toTimestamp(
                              segment.t1
                            )}]  ${segment.text}`
                        )
                        .join("\n")}`
                  );
                  if (!isCapturing) {
                    setStopTranscribe(null);
                    log("Finished realtime transcribing");
                  }
                });
              } catch (e) {
                log("Error:", e);
              }
            }}
          >
            <Text style={styles.buttonText}>
              {stopTranscribe?.stop ? "Stop" : "Realtime"}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.logContainer}>
          {logs.map((msg, index) => (
            <Text key={index} style={styles.logText}>
              {msg}
            </Text>
          ))}
        </View>
        {transcibeResult && (
          <View style={styles.logContainer}>
            <Text style={styles.logText}>{transcibeResult}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, styles.buttonClear]}
          onPress={async () => {
            if (!whisperContext) return;
            await whisperContext.release();
            setWhisperContext(null);
            log("Released context");
          }}
        >
          <Text style={styles.buttonText}>Release Context</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.buttonClear]}
          onPress={() => {
            setLogs([]);
            setTranscibeResult("");
          }}
        >
          <Text style={styles.buttonText}>Clear Logs</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.buttonClear]}
          onPress={async () => {
            await RNFS.unlink(fileDir).catch(() => {});
            log("Deleted files");
          }}
        >
          <Text style={styles.buttonText}>Clear Download files</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.buttonClear]}
          onPress={async () => {
            if (!(await RNFS.exists(recordFile))) {
              log("Recorded file does not exist");
              return;
            }
            const player = new Sound(recordFile, "", (e) => {
              if (e) {
                log("error", e);
                return;
              }
              player.play((success) => {
                if (success) {
                  log("successfully finished playing");
                } else {
                  log("playback failed due to audio decoding errors");
                }
                player.release();
              });
            });
          }}
        >
          <Text style={styles.buttonText}>Play Recorded file</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </ScrollView>
  );
}
