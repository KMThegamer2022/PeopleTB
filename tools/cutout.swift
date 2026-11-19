// macOS-only helper: removes the background from a photo using Apple Vision.
// usage: swift tools/cutout.swift in.jpg out.png
import Vision
import CoreImage
import Foundation
let args = CommandLine.arguments
let img = CIImage(contentsOf: URL(fileURLWithPath: args[1]), options: [.applyOrientationProperty: true])!
let handler = VNImageRequestHandler(ciImage: img)
let req = VNGenerateForegroundInstanceMaskRequest()
try handler.perform([req])
guard let obs = req.results?.first else { fatalError("no subject found") }
let buf = try obs.generateMaskedImage(ofInstances: obs.allInstances, from: handler, croppedToInstancesExtent: false)
let ci = CIImage(cvPixelBuffer: buf)
try CIContext().writePNGRepresentation(of: ci, to: URL(fileURLWithPath: args[2]), format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
print("ok", args[2])
