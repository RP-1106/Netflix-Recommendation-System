import onnxruntime as ort
sess = ort.InferenceSession("data/bert4rec_v3.onnx")
print([i.name for i in sess.get_inputs()])
print([i.shape for i in sess.get_inputs()])